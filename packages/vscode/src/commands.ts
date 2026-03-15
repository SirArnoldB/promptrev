import * as vscode from 'vscode';
import type { EnhancerOutput } from '@promptrev/core';

// Store the most recent enhancement result so button commands can access it.
// This is safe because chat interactions are sequential — a user cannot
// click Accept on a previous result while a new enhancement is in progress.
let pendingResult: EnhancerOutput | null = null;

export function setPendingResult(result: EnhancerOutput | null): void {
  pendingResult = result;
}

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('promptrev.accept', async (revised?: string) => {
      const text = revised ?? pendingResult?.revised;
      if (!text) return;

      // Open chat with the revised prompt pre-filled and submitted
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', { query: text });
      } catch {
        // Fallback: copy to clipboard
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage(
          'PromptRev: Revised prompt copied to clipboard — paste in chat to send.'
        );
      }
      setPendingResult(null);
    }),

    vscode.commands.registerCommand('promptrev.editFirst', async (revised?: string) => {
      const text = revised ?? pendingResult?.revised;
      if (!text) return;

      // Open chat with the revised prompt pre-filled but NOT submitted (partial query)
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query: text,
          isPartialQuery: true,
        });
      } catch {
        // Fallback: copy to clipboard
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage(
          'PromptRev: Revised prompt copied to clipboard — paste in chat to edit.'
        );
      }
      setPendingResult(null);
    }),

    vscode.commands.registerCommand('promptrev.dismiss', () => {
      setPendingResult(null);
      // No UI feedback needed — user explicitly dismissed
    })
  );
}
