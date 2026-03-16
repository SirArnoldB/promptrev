import * as vscode from 'vscode';
import { registerParticipant } from './participant';
import { registerKeybinding } from './keybinding';
import { registerCommands } from './commands';
import { initHistoryManager } from './history-manager';
import { HistoryPanelProvider } from './history-panel';
import { ProjectConfigProvider } from './project-config';
import { openTemplatePickerCommand } from './template-picker';

export function activate(context: vscode.ExtensionContext): void {
  initHistoryManager(context);

  const historyPanel = new HistoryPanelProvider(context.extensionUri);
  const projectConfig = new ProjectConfigProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(HistoryPanelProvider.viewId, historyPanel)
  );

  // Load .promptrev.json asynchronously — participant/keybinding read it on each invocation
  void projectConfig.init();

  registerCommands(context, historyPanel, () =>
    openTemplatePickerCommand(historyPanel, projectConfig)
  );
  registerParticipant(context, historyPanel, projectConfig);
  registerKeybinding(context, historyPanel, projectConfig);
}

export function deactivate(): void {}
