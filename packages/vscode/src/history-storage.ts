import * as vscode from 'vscode';
import type { HistoryStorage, HistoryEntry } from '@promptrev/core';

const STATE_KEY = 'promptrev.history';

/**
 * VS Code globalState-backed storage for HistoryManager.
 * Entries survive extension restarts and VS Code sessions.
 */
export class GlobalStateStorage implements HistoryStorage {
  constructor(private readonly globalState: vscode.Memento) {}

  get(): HistoryEntry[] {
    return this.globalState.get<HistoryEntry[]>(STATE_KEY) ?? [];
  }

  set(entries: HistoryEntry[]): void {
    // Fire-and-forget — globalState.update returns a Promise but errors are non-fatal
    void this.globalState.update(STATE_KEY, entries);
  }
}
