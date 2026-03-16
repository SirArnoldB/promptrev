import * as vscode from 'vscode';
import { registerParticipant } from './participant';
import { registerKeybinding } from './keybinding';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext): void {
  registerCommands(context);
  registerParticipant(context);
  registerKeybinding(context);
}

export function deactivate(): void {}
