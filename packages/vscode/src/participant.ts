import * as vscode from 'vscode';
import { enhance, RuleBasedAdapter, resolveModifier, BUILT_IN_TEMPLATES } from '@promptrev/core';
import type { EnhancerOutput } from '@promptrev/core';
import { VSCodeModelAdapter } from './vscode-model-adapter';
import { parseModifierFromCommand } from './utils';
import { selectModel, handleNoModel } from './model-selector';
import { addPendingResult } from './commands';
import { getHistoryManager } from './history-manager';
import { runTemplateFlow } from './template-picker';
import type { HistoryPanelProvider } from './history-panel';
import type { ProjectConfigProvider } from './project-config';

// Track unknown modifiers already notified this session — avoid repeated toasts
const _notifiedUnknownModifiers = new Set<string>();

export function registerParticipant(
  context: vscode.ExtensionContext,
  historyPanel: HistoryPanelProvider,
  projectConfig: ProjectConfigProvider
): void {
  const participant = vscode.chat.createChatParticipant('promptrev.rev', (req, ctx, stream, token) =>
    handler(req, ctx, stream, token, historyPanel, projectConfig)
  );
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icons', 'rev.png');
  context.subscriptions.push(participant);
}

async function handler(
  request: vscode.ChatRequest,
  _context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  historyPanel: HistoryPanelProvider,
  projectConfig: ProjectConfigProvider
): Promise<void> {
  const command = request.command;

  // ── Template flow: @rev /template or @rev /bug-fix etc. ──────────────────
  const isTemplateCommand =
    command === 'template' ||
    (command !== undefined && command in BUILT_IN_TEMPLATES) ||
    projectConfig.isKnownTemplate(command ?? '');

  if (isTemplateCommand) {
    // 'template' with no pre-selection → open picker
    // any other template key → go straight to variable input
    await runTemplateFlow(
      stream,
      token,
      historyPanel,
      projectConfig,
      command !== 'template' ? command : undefined
    );
    return;
  }

  // ── Modifier flow (existing behaviour) ────────────────────────────────────
  const modifier = parseModifierFromCommand(command);
  const rawPrompt = request.prompt.trim();

  if (!rawPrompt) {
    stream.markdown('Please provide a prompt to enhance. Example: `@rev fix the auth bug`');
    return;
  }

  const domainContext = projectConfig.getMergedDomainContext();
  const userModifiers = projectConfig.getMergedModifiers();

  // Notify once per session if an unknown modifier key was typed (#23)
  if (modifier !== 'default' && !projectConfig.isKnownModifier(modifier) && !_notifiedUnknownModifiers.has(modifier)) {
    _notifiedUnknownModifiers.add(modifier);
    vscode.window.showInformationMessage(
      `PromptRev: Unknown modifier "${modifier}" — falling back to default. Define it in .promptrev.json or settings.json to use it.`
    );
  }

  // Resolve modifier definition to check acceptMode up front
  const modifierDef = resolveModifier(modifier, userModifiers);

  // Select model — with all-vendor fallback (#15)
  const model = await selectModel();

  if (!model) {
    const shouldAbort = await handleNoModel(modifier); // (#16)
    if (shouldAbort) return;
  }

  const adapter = model ? new VSCodeModelAdapter(model, token) : new RuleBasedAdapter();

  // Wire VS Code cancellation token to AbortSignal (#12)
  const controller = new AbortController();
  const cancelListener = token.onCancellationRequested(() => controller.abort());

  stream.progress('Revising prompt...');

  try {
    const result = await enhance({
      rawPrompt,
      modifier,
      domainContext,
      modelAdapter: adapter,
      userModifiers,
      signal: controller.signal,
    });

    if (result.skipped) {
      stream.markdown(
        '> **PromptRev:** Prompt is too short to enhance meaningfully. ' +
          'Add more context about what you need help with.'
      );
      return;
    }

    // Record to history and refresh the panel
    getHistoryManager().add({
      original: result.original,
      revised: result.revised,
      modifier: result.modifier as string,
      accepted: false,
    });
    historyPanel.refresh();

    // :rb and any modifier with acceptMode:'auto' — skip diff, show result directly (#13)
    if (modifierDef.acceptMode === 'auto') {
      stream.markdown(`**Enhanced prompt:**\n\n\`\`\`\n${result.revised}\n\`\`\``);
      addPendingResult(result);
      await vscode.commands.executeCommand('promptrev.accept', result.timestamp);
      return;
    }

    // Standard diff flow — show original vs revised, then action buttons (#13)
    renderResult(stream, result);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    stream.markdown(
      `> **PromptRev error:** ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  } finally {
    cancelListener.dispose();
  }
}

function renderResult(
  stream: vscode.ChatResponseStream,
  result: EnhancerOutput
): void {
  // Register result by timestamp — consumed on first button click
  addPendingResult(result);

  // Lead with signal if available, then revised prompt
  const signalLine = result.signal
    ? `✨ ${result.signal}`
    : '✨ **Prompt improved** — revised prompt ready to send:';
  stream.markdown(`${signalLine}\n\n`);
  stream.markdown(`\`\`\`\n${result.revised}\n\`\`\`\n\n`);

  // Three buttons — clear hierarchy, no Dismiss (closing chat is implicit dismissal)
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
