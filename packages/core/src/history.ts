import { randomUUID } from 'crypto';

export interface HistoryEntry {
  id: string;
  original: string;
  revised: string;
  userEdited?: string;
  modifier: string;
  timestamp: number;
  accepted: boolean;
}

export interface HistoryStorage {
  get(): HistoryEntry[];
  set(entries: HistoryEntry[]): void;
}

/** In-memory storage — used as default and in tests */
export class InMemoryStorage implements HistoryStorage {
  private entries: HistoryEntry[] = [];

  get(): HistoryEntry[] {
    return [...this.entries];
  }

  set(entries: HistoryEntry[]): void {
    this.entries = [...entries];
  }
}

export class HistoryManager {
  private storage: HistoryStorage;
  private maxEntries: number;

  constructor(storage: HistoryStorage = new InMemoryStorage(), maxEntries = 100) {
    this.storage = storage;
    this.maxEntries = maxEntries;
  }

  add(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): HistoryEntry {
    const full: HistoryEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    const entries = this.storage.get();
    entries.unshift(full); // newest first

    if (entries.length > this.maxEntries) {
      entries.splice(this.maxEntries);
    }

    this.storage.set(entries);
    return full;
  }

  getAll(): HistoryEntry[] {
    return this.storage.get();
  }

  getById(id: string): HistoryEntry | undefined {
    return this.storage.get().find((e) => e.id === id);
  }

  /** Returns the original prompt text for a given history entry id */
  restore(id: string): string | undefined {
    return this.getById(id)?.original;
  }

  export(): string {
    return JSON.stringify(this.storage.get(), null, 2);
  }

  clear(): void {
    this.storage.set([]);
  }
}
