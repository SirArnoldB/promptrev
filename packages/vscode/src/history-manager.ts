import * as vscode from 'vscode';
import { HistoryManager } from '@promptrev/core';
import { GlobalStateStorage } from './history-storage';

let _manager: HistoryManager | undefined;

export function initHistoryManager(context: vscode.ExtensionContext): HistoryManager {
  const config = vscode.workspace.getConfiguration('promptrev');
  const maxEntries = config.get<number>('maxHistory') ?? 100;
  const storage = new GlobalStateStorage(context.globalState);
  _manager = new HistoryManager(storage, maxEntries);
  return _manager;
}

export function getHistoryManager(): HistoryManager {
  if (!_manager) {
    throw new Error('HistoryManager not initialized — call initHistoryManager first.');
  }
  return _manager;
}
