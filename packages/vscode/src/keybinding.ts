import * as vscode from 'vscode';
import { enhance, RuleBasedAdapter } from '@promptrev/core';
import { VSCodeModelAdapter } from './vscode-model-adapter';
import { selectModel } from './model-selector';

export function registerKeybinding(context: vscode.ExtensionContext): void {
  const cmd = vscode.commands.registerCommand('promptrev.enhanceSelection', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    const text = editor.document.getText(selection.isEmpty ? undefined : selection).trim();

    if (!text) {
      vscode.window.showInformationMessage('PromptRev: Select some text to enhance.');
      return;
    }

    const config = vscode.workspace.getConfiguration('promptrev');
    const domainContext = config.get<string>('domainContext') || undefined;
    const userModifiers = config.get<Record<string, object>>('modifiers') || {};

    const tokenSource = new vscode.CancellationTokenSource();
    const model = await selectModel();
    const adapter = model
      ? new VSCodeModelAdapter(model, tokenSource.token)
      : new RuleBasedAdapter();

    try {
      const result = await enhance({
        rawPrompt: text,
        modifier: 'default',
        domainContext,
        modelAdapter: adapter,
        userModifiers,
      });

      if (result.skipped) {
        vscode.window.showInformationMessage('PromptRev: No significant changes needed.');
        return;
      }

      const choice = await vscode.window.showInformationMessage(
        `PromptRev: Prompt enhanced. Replace selection or copy to clipboard?`,
        'Replace Selection',
        'Copy to Clipboard',
        'Dismiss'
      );

      if (choice === 'Replace Selection' && !selection.isEmpty) {
        await editor.edit((b) => b.replace(selection, result.revised));
      } else if (choice === 'Copy to Clipboard') {
        await vscode.env.clipboard.writeText(result.revised);
        vscode.window.showInformationMessage('PromptRev: Enhanced prompt copied to clipboard.');
      }
    } catch (err) {
      vscode.window.showErrorMessage(
        `PromptRev: Enhancement failed — ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      tokenSource.dispose();
    }
  });

  context.subscriptions.push(cmd);
}
