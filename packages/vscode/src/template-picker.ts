import * as vscode from 'vscode';
import {
  enhance,
  resolveTemplate,
  TemplateVariableError,
  RuleBasedAdapter,
  BUILT_IN_MODIFIERS,
} from '@promptrev/core';
import type { PromptTemplate, EnhancerOutput } from '@promptrev/core';
import { VSCodeModelAdapter } from './vscode-model-adapter';
import { selectModel } from './model-selector';
import { addPendingResult } from './commands';
import { getHistoryManager } from './history-manager';
import { formatDiffMarkdown } from '@promptrev/core';
import type { HistoryPanelProvider } from './history-panel';
import type { ProjectConfigProvider, MergedTemplate } from './project-config';

const SOURCE_LABEL: Record<string, string> = {
  'built-in': '$(tools) Built-in',
  user: '$(person) Your templates',
  team: '$(organization) Team (.promptrev.json)',
};

const SOURCE_ICON: Record<string, string> = {
  'built-in': '$(tools)',
  user: '$(person)',
  team: '$(organization)',
};

interface TemplateQuickPickItem extends vscode.QuickPickItem {
  templateKey: string;
}

/**
 * Opens the template Quick Pick, collects variable values, optionally applies
 * a modifier, then calls enhance() and renders the result into `stream`.
 *
 * Used from the @rev /template command (and template sub-commands like /bug-fix).
 */
export async function runTemplateFlow(
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  historyPanel: HistoryPanelProvider,
  projectConfig: ProjectConfigProvider,
  preSelectedKey?: string
): Promise<void> {
  const mergedTemplates = projectConfig.getMergedTemplates();
  const userTemplates = projectConfig.getMergedRawTemplates();

  // ── Step 1: pick a template (or use pre-selected) ────────────────────────
  let selectedTemplate: PromptTemplate | undefined;

  if (preSelectedKey) {
    const found = mergedTemplates.find((m) => m.template.key === preSelectedKey);
    selectedTemplate = found?.template;
    if (!selectedTemplate) {
      stream.markdown(
        `> **PromptRev:** Unknown template \`${preSelectedKey}\`. Use \`@rev /template\` to browse available templates.`
      );
      return;
    }
  } else {
    selectedTemplate = await pickTemplate(mergedTemplates, token);
    if (!selectedTemplate) return; // user cancelled
  }

  // ── Step 2: offer editor selection as variable value ─────────────────────
  const editorSelection = getEditorSelection();

  // ── Step 3: collect variable values ──────────────────────────────────────
  const variableValues = await collectVariables(
    selectedTemplate,
    editorSelection,
    token
  );
  if (variableValues === undefined) return; // user cancelled

  // ── Step 4: fill the template ─────────────────────────────────────────────
  let filledPrompt: string;
  try {
    filledPrompt = resolveTemplate(selectedTemplate.key, variableValues, userTemplates);
  } catch (err) {
    if (err instanceof TemplateVariableError) {
      stream.markdown(
        `> **PromptRev:** Missing required variables: \`${err.missingVariables.join('`, `')}\`.`
      );
    }
    return;
  }

  // ── Step 5: offer suggested modifier ─────────────────────────────────────
  let chosenModifier = 'default';
  if (selectedTemplate.suggestedModifier && selectedTemplate.suggestedModifier !== 'default') {
    const modKey = selectedTemplate.suggestedModifier;
    const modDef = BUILT_IN_MODIFIERS[modKey];
    const label = modDef?.label ?? modKey;
    const desc = modDef?.description ?? '';
    const choice = await vscode.window.showInformationMessage(
      `Apply :${label} modifier? ${desc}`,
      `Yes, apply :${label}`,
      'No, use default'
    );
    if (choice === undefined) return; // cancelled
    if (choice.startsWith('Yes')) chosenModifier = modKey;
  }

  // ── Step 6: enhance ───────────────────────────────────────────────────────
  const domainContext = projectConfig.getMergedDomainContext();
  const model = await selectModel();
  const adapter = model
    ? new VSCodeModelAdapter(model, token)
    : new RuleBasedAdapter();

  const controller = new AbortController();
  const cancelListener = token.onCancellationRequested(() => controller.abort());

  stream.progress('Revising template prompt...');

  try {
    const result = await enhance({
      rawPrompt: filledPrompt,
      modifier: chosenModifier,
      domainContext,
      modelAdapter: adapter,
      userModifiers: projectConfig.getMergedModifiers(),
      signal: controller.signal,
    });

    getHistoryManager().add({
      original: result.original,
      revised: result.revised,
      modifier: result.modifier as string,
      accepted: false,
    });
    historyPanel.refresh();

    renderTemplateResult(stream, result, selectedTemplate.name);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    stream.markdown(
      `> **PromptRev error:** ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  } finally {
    cancelListener.dispose();
  }
}

/**
 * Standalone command handler — opens the picker without a chat stream.
 * Used by the promptrev.openTemplatePicker command (Cmd+Shift+T).
 */
export async function openTemplatePickerCommand(
  historyPanel: HistoryPanelProvider,
  projectConfig: ProjectConfigProvider
): Promise<void> {
  const mergedTemplates = projectConfig.getMergedTemplates();
  const userTemplates = projectConfig.getMergedRawTemplates();

  const tokenSource = new vscode.CancellationTokenSource();
  const selectedTemplate = await pickTemplate(mergedTemplates, tokenSource.token);
  if (!selectedTemplate) {
    tokenSource.dispose();
    return;
  }

  const editorSelection = getEditorSelection();
  const variableValues = await collectVariables(selectedTemplate, editorSelection, tokenSource.token);
  if (variableValues === undefined) {
    tokenSource.dispose();
    return;
  }

  let filledPrompt: string;
  try {
    filledPrompt = resolveTemplate(selectedTemplate.key, variableValues, userTemplates);
  } catch (err) {
    if (err instanceof TemplateVariableError) {
      vscode.window.showWarningMessage(
        `PromptRev: Missing required variables: ${err.missingVariables.join(', ')}`
      );
    }
    tokenSource.dispose();
    return;
  }

  // Offer suggested modifier
  let chosenModifier = 'default';
  if (selectedTemplate.suggestedModifier && selectedTemplate.suggestedModifier !== 'default') {
    const modKey = selectedTemplate.suggestedModifier;
    const modDef = BUILT_IN_MODIFIERS[modKey];
    const label = modDef?.label ?? modKey;
    const desc = modDef?.description ?? '';
    const choice = await vscode.window.showInformationMessage(
      `Apply :${label} modifier? ${desc}`,
      `Yes, apply :${label}`,
      'No, use default'
    );
    if (choice === undefined) {
      tokenSource.dispose();
      return;
    }
    if (choice.startsWith('Yes')) chosenModifier = modKey;
  }

  const domainContext = projectConfig.getMergedDomainContext();
  const model = await selectModel();
  const adapter = model
    ? new VSCodeModelAdapter(model, tokenSource.token)
    : new RuleBasedAdapter();

  try {
    const result = await enhance({
      rawPrompt: filledPrompt,
      modifier: chosenModifier,
      domainContext,
      modelAdapter: adapter,
      userModifiers: projectConfig.getMergedModifiers(),
    });

    getHistoryManager().add({
      original: result.original,
      revised: result.revised,
      modifier: result.modifier as string,
      accepted: false,
    });
    historyPanel.refresh();

    // Copy to clipboard and offer to open in chat
    await vscode.env.clipboard.writeText(result.revised);
    const action = await vscode.window.showInformationMessage(
      `PromptRev: Template "${selectedTemplate.name}" filled and enhanced — copied to clipboard.`,
      'Open in Chat',
      'Dismiss'
    );
    if (action === 'Open in Chat') {
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query: result.revised,
          isPartialQuery: true,
        });
      } catch {
        // Chat not available — clipboard copy was already done above
      }
    }
  } catch (err) {
    vscode.window.showErrorMessage(
      `PromptRev: Template enhancement failed — ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  } finally {
    tokenSource.dispose();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function pickTemplate(
  mergedTemplates: MergedTemplate[],
  _token: vscode.CancellationToken
): Promise<PromptTemplate | undefined> {
  // Group by source for separators
  const groups: Record<string, MergedTemplate[]> = { 'built-in': [], user: [], team: [] };
  for (const m of mergedTemplates) {
    groups[m.source].push(m);
  }

  const items: (TemplateQuickPickItem | vscode.QuickPickItem)[] = [];

  for (const source of ['built-in', 'user', 'team'] as const) {
    const group = groups[source];
    if (group.length === 0) continue;

    items.push({ label: SOURCE_LABEL[source], kind: vscode.QuickPickItemKind.Separator });

    for (const m of group) {
      items.push({
        label: `${SOURCE_ICON[source]} ${m.template.name}`,
        description: m.template.description,
        detail: m.template.tags.length > 0 ? m.template.tags.join(', ') : undefined,
        templateKey: m.template.key,
      } as TemplateQuickPickItem);
    }
  }

  const picked = await vscode.window.showQuickPick(items as TemplateQuickPickItem[], {
    title: 'PromptRev: Browse Templates',
    placeHolder: 'Select a template to fill',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!picked || !('templateKey' in picked)) return undefined;

  return mergedTemplates.find((m) => m.template.key === picked.templateKey)?.template;
}

async function collectVariables(
  template: PromptTemplate,
  editorSelection: string | undefined,
  token: vscode.CancellationToken
): Promise<Record<string, string> | undefined> {
  const values: Record<string, string> = {};
  const total = template.variables.length;

  for (let i = 0; i < total; i++) {
    if (token.isCancellationRequested) return undefined;

    const variable = template.variables[i];

    // Offer editor selection for variables likely to contain code/context
    if (editorSelection && isContextVariable(variable.name) && !(variable.name in values)) {
      const use = await vscode.window.showInformationMessage(
        `PromptRev: Use editor selection as "${variable.description}"?`,
        'Yes',
        'No, I\'ll type it'
      );
      if (use === undefined) return undefined; // cancelled
      if (use === 'Yes') {
        values[variable.name] = editorSelection;
        continue;
      }
    }

    const inputBox = vscode.window.createInputBox();
    inputBox.title = `${template.name} (${i + 1}/${total})`;
    inputBox.prompt = variable.description;
    inputBox.placeholder = variable.placeholder;
    inputBox.ignoreFocusOut = true;

    if (!variable.required) {
      inputBox.buttons = [
        { iconPath: new vscode.ThemeIcon('debug-step-over'), tooltip: 'Skip (optional)' },
      ];
    }

    const value = await new Promise<string | undefined>((resolve) => {
      let accepted = false;

      inputBox.onDidAccept(() => {
        accepted = true;
        resolve(inputBox.value);
        inputBox.dispose();
      });

      inputBox.onDidTriggerButton(() => {
        // Skip button (only shown for optional variables)
        accepted = true;
        resolve('');
        inputBox.dispose();
      });

      inputBox.onDidHide(() => {
        if (!accepted) resolve(undefined);
        inputBox.dispose();
      });

      token.onCancellationRequested(() => {
        resolve(undefined);
        inputBox.dispose();
      });

      inputBox.show();
    });

    if (value === undefined) return undefined; // user cancelled

    // Required fields: keep prompting if blank
    if (variable.required && !value.trim()) {
      vscode.window.showWarningMessage(
        `PromptRev: "${variable.description}" is required.`
      );
      i--; // retry this variable
      continue;
    }

    values[variable.name] = value;
  }

  return values;
}

function getEditorSelection(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) return undefined;
  const text = editor.document.getText(editor.selection).trim();
  return text || undefined;
}

/** Variables that are good candidates for injecting editor selection */
function isContextVariable(name: string): boolean {
  return ['context', 'code', 'file_or_module', 'target'].includes(name);
}

function renderTemplateResult(
  stream: vscode.ChatResponseStream,
  result: EnhancerOutput,
  templateName: string
): void {
  addPendingResult(result);

  const header = result.signal
    ? `✨ **${templateName}** — ${result.signal}`
    : `✨ **${templateName}** template filled and enhanced:`;

  stream.markdown(`${header}\n\n`);
  stream.markdown(`\`\`\`\n${result.revised}\n\`\`\``);
  stream.markdown('\n\n**Changes:**\n\n');
  stream.markdown(formatDiffMarkdown(result.original, result.revised));
  stream.markdown('\n\n');

  stream.button({
    command: 'promptrev.accept',
    title: '$(check) Send Improved',
    arguments: [result.timestamp],
  });
  stream.button({
    command: 'promptrev.sendOriginal',
    title: '$(arrow-right) Send Original',
    arguments: [result.timestamp],
  });
  stream.button({
    command: 'promptrev.editFirst',
    title: '$(edit) Edit',
    arguments: [result.timestamp],
  });
}
