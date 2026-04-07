import * as vscode from 'vscode';
import type { EnhancerOutput } from '@promptrev/core';
import type { HistoryPanelProvider } from './history-panel';
import type { ParsedReferences } from './references';

interface PendingEntry {
  result: EnhancerOutput;
  refs?: ParsedReferences;
}

// Keyed by result.timestamp — each enhancement gets a unique ID.
// Entries are deleted on first use so re-clicking a button has no effect.
const pendingResults = new Map<number, PendingEntry>();

export function addPendingResult(result: EnhancerOutput, refs?: ParsedReferences): void {
  pendingResults.set(result.timestamp, { result, refs });
}

function consumeResult(timestamp: number): PendingEntry | undefined {
  const entry = pendingResults.get(timestamp);
  if (entry) pendingResults.delete(timestamp);
  return entry;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  _historyPanel: HistoryPanelProvider,
  openTemplatePicker: () => Promise<void>
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('promptrev.openHistory', () => {
      void vscode.commands.executeCommand('promptrev.history.focus');
    }),

    vscode.commands.registerCommand('promptrev.openTemplatePicker', () => {
      void openTemplatePicker();
    }),

    vscode.commands.registerCommand('promptrev.accept', async (timestamp?: number) => {
      const entry = timestamp !== undefined ? consumeResult(timestamp) : undefined;
      if (!entry) {
        vscode.window.showInformationMessage(
          'PromptRev: This enhancement has already been applied.'
        );
        return;
      }

      const promptWithRefs = appendReferenceMarkers(entry.result.revised, entry.refs);

      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query: promptWithRefs,
        });
      } catch {
        await vscode.env.clipboard.writeText(promptWithRefs);
        vscode.window.showInformationMessage(
          'PromptRev: Revised prompt copied to clipboard — paste in chat to send.'
        );
      }
    }),

    vscode.commands.registerCommand('promptrev.editFirst', async (timestamp?: number) => {
      const entry = timestamp !== undefined ? consumeResult(timestamp) : undefined;
      if (!entry) {
        vscode.window.showInformationMessage(
          'PromptRev: This enhancement has already been applied.'
        );
        return;
      }

      const promptWithRefs = appendReferenceMarkers(entry.result.revised, entry.refs);

      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query: promptWithRefs,
          isPartialQuery: true,
        });
      } catch {
        await vscode.env.clipboard.writeText(promptWithRefs);
        vscode.window.showInformationMessage(
          'PromptRev: Revised prompt copied to clipboard — paste in chat to edit.'
        );
      }
    }),

    vscode.commands.registerCommand('promptrev.sendOriginal', async (timestamp?: number) => {
      const entry = timestamp !== undefined ? consumeResult(timestamp) : undefined;
      if (!entry) {
        vscode.window.showInformationMessage(
          'PromptRev: This enhancement has already been applied.'
        );
        return;
      }

      const promptWithRefs = appendReferenceMarkers(entry.result.original, entry.refs);

      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query: promptWithRefs,
        });
      } catch {
        await vscode.env.clipboard.writeText(promptWithRefs);
        vscode.window.showInformationMessage(
          'PromptRev: Original prompt copied to clipboard — paste in chat to send.'
        );
      }
    }),

    vscode.commands.registerCommand('promptrev.dismiss', (timestamp?: number) => {
      if (timestamp !== undefined) consumeResult(timestamp);
      // No UI feedback — user explicitly dismissed
    })
  );
}

/**
 * Appends #file:name markers for any attached file references that aren't
 * already present in the prompt text. This is a best-effort attempt to
 * restore context markers when the enhanced prompt is sent to chat.
 */
function appendReferenceMarkers(prompt: string, refs?: ParsedReferences): string {
  if (!refs || refs.files.length === 0) return prompt;

  const missingMarkers = refs.files
    .filter((f) => f.uri && !prompt.includes(`#file:${f.name}`))
    .map((f) => `#file:${f.name}`);

  if (missingMarkers.length === 0) return prompt;

  return `${prompt}\n\n${missingMarkers.join(' ')}`;
}
