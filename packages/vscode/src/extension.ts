import * as vscode from 'vscode';
import { registerParticipant } from './participant';
import { registerKeybinding } from './keybinding';

export function activate(context: vscode.ExtensionContext): void {
  registerParticipant(context);
  registerKeybinding(context);
}

export function deactivate(): void {}
