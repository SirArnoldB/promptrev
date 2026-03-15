import * as vscode from 'vscode';
import { enhance, RuleBasedAdapter, formatDiffMarkdown } from '@promptrev/core';
import { VSCodeModelAdapter } from './vscode-model-adapter';
import { parseModifierFromCommand } from './utils';

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

  const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
  const adapter =
    models.length > 0 ? new VSCodeModelAdapter(models[0], token) : new RuleBasedAdapter();

  if (models.length === 0 && modifier !== 'fast') {
    stream.markdown(
      '> **PromptRev:** No language model available. Using rule-based enhancement. ' +
        'For better results, activate GitHub Copilot or configure an API key in settings.\n\n'
    );
  }

  const signal = new AbortController().signal;

  try {
    const result = await enhance({
      rawPrompt,
      modifier,
      domainContext,
      modelAdapter: adapter,
      userModifiers,
      signal,
    });

    if (result.skipped) {
      stream.markdown(
        '> **PromptRev:** Prompt is too short to enhance meaningfully. ' +
          'Add more context about what you need help with.'
      );
      return;
    }

    stream.markdown(formatDiffMarkdown(result.original, result.revised));
    stream.markdown('\n\n---\n');
    stream.markdown('**Revised prompt (copy and send):**\n\n');
    stream.markdown(`\`\`\`\n${result.revised}\n\`\`\``);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    stream.markdown(`> **PromptRev error:** ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}
