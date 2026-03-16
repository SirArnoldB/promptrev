import * as vscode from 'vscode';
import { registerParticipant } from './participant';
import { registerKeybinding } from './keybinding';
import { registerCommands } from './commands';
import { initHistoryManager } from './history-manager';
import { HistoryPanelProvider } from './history-panel';

export function activate(context: vscode.ExtensionContext): void {
  initHistoryManager(context);

  const historyPanel = new HistoryPanelProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(HistoryPanelProvider.viewId, historyPanel)
  );

  registerCommands(context, historyPanel);
  registerParticipant(context, historyPanel);
  registerKeybinding(context, historyPanel);
}

export function deactivate(): void {}
