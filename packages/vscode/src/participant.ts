import * as vscode from 'vscode';
import { enhance, RuleBasedAdapter, resolveModifier, formatDiffMarkdown } from '@promptrev/core';
import type { EnhancerOutput } from '@promptrev/core';
import { VSCodeModelAdapter } from './vscode-model-adapter';
import { parseModifierFromCommand } from './utils';
import { selectModel, handleNoModel } from './model-selector';
import { addPendingResult } from './commands';

export function registerParticipant(context: vscode.ExtensionContext): void {
  const participant = vscode.chat.createChatParticipant('promptrev.rev', handler);
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icons', 'rev.png');
  context.subscriptions.push(participant);
}

async function handler(
  request: vscode.ChatRequest,
  _context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<void> {
  const modifier = parseModifierFromCommand(request.command);
  const rawPrompt = request.prompt.trim();

  if (!rawPrompt) {
    stream.markdown('Please provide a prompt to enhance. Example: `@rev fix the auth bug`');
    return;
  }

  const config = vscode.workspace.getConfiguration('promptrev');
  const domainContext = config.get<string>('domainContext') || undefined;
  const userModifiers = config.get<Record<string, object>>('modifiers') || {};

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

    // :fast and any modifier with acceptMode:'auto' — skip diff, show result directly (#13)
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

  // Diff view
  stream.markdown(formatDiffMarkdown(result.original, result.revised));
  stream.markdown('\n\n---\n\n**Revised prompt:**\n\n');
  stream.markdown(`\`\`\`\n${result.revised}\n\`\`\``);
  stream.markdown('\n\n');

  // Action buttons — pass timestamp as ID, not the text, so re-clicks are no-ops (#13)
  stream.button({
    command: 'promptrev.accept',
    title: '$(check) Accept & Send',
    arguments: [result.timestamp],
  });
  stream.button({
    command: 'promptrev.editFirst',
    title: '$(edit) Edit First',
    arguments: [result.timestamp],
  });
  stream.button({
    command: 'promptrev.sendOriginal',
    title: '$(arrow-right) Send Original',
    arguments: [result.timestamp],
  });
  stream.button({
    command: 'promptrev.dismiss',
    title: '$(close) Dismiss',
    arguments: [result.timestamp],
  });
}
