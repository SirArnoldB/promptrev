import * as vscode from 'vscode';
import type { EnhancerOutput } from '@promptrev/core';

// Keyed by result.timestamp — each enhancement gets a unique ID.
// Entries are deleted on first use so re-clicking a button has no effect.
const pendingResults = new Map<number, EnhancerOutput>();

export function addPendingResult(result: EnhancerOutput): void {
  pendingResults.set(result.timestamp, result);
}

function consumeResult(timestamp: number): EnhancerOutput | undefined {
  const result = pendingResults.get(timestamp);
  if (result) pendingResults.delete(timestamp);
  return result;
}

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('promptrev.accept', async (timestamp?: number) => {
      const result = timestamp !== undefined ? consumeResult(timestamp) : undefined;
      if (!result) {
        vscode.window.showInformationMessage('PromptRev: This enhancement has already been applied.');
        return;
      }

      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', { query: result.revised });
      } catch {
        await vscode.env.clipboard.writeText(result.revised);
        vscode.window.showInformationMessage(
          'PromptRev: Revised prompt copied to clipboard — paste in chat to send.'
        );
      }
    }),

    vscode.commands.registerCommand('promptrev.editFirst', async (timestamp?: number) => {
      const result = timestamp !== undefined ? consumeResult(timestamp) : undefined;
      if (!result) {
        vscode.window.showInformationMessage('PromptRev: This enhancement has already been applied.');
        return;
      }

      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query: result.revised,
          isPartialQuery: true,
        });
      } catch {
        await vscode.env.clipboard.writeText(result.revised);
        vscode.window.showInformationMessage(
          'PromptRev: Revised prompt copied to clipboard — paste in chat to edit.'
        );
      }
    }),

    vscode.commands.registerCommand('promptrev.sendOriginal', async (timestamp?: number) => {
      const result = timestamp !== undefined ? consumeResult(timestamp) : undefined;
      if (!result) {
        vscode.window.showInformationMessage('PromptRev: This enhancement has already been applied.');
        return;
      }

      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', { query: result.original });
      } catch {
        await vscode.env.clipboard.writeText(result.original);
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
