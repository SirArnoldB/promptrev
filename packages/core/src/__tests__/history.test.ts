import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryManager, InMemoryStorage } from '../history';

describe('HistoryManager', () => {
  let manager: HistoryManager;

  beforeEach(() => {
    manager = new HistoryManager(new InMemoryStorage(), 100);
  });

  it('adds an entry and retrieves it', () => {
    manager.add({ original: 'fix bug', revised: 'Fix the bug.', modifier: 'default', accepted: true });
    const entries = manager.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].original).toBe('fix bug');
  });

  it('entries are returned newest-first', () => {
    manager.add({ original: 'first', revised: 'First.', modifier: 'default', accepted: true });
    manager.add({ original: 'second', revised: 'Second.', modifier: 'fast', accepted: true });
    const entries = manager.getAll();
    expect(entries[0].original).toBe('second');
    expect(entries[1].original).toBe('first');
  });

  it('restore returns the original prompt', () => {
    const entry = manager.add({ original: 'my prompt', revised: 'My prompt.', modifier: 'default', accepted: true });
    expect(manager.restore(entry.id)).toBe('my prompt');
  });

  it('restore returns undefined for unknown id', () => {
    expect(manager.restore('nonexistent-id')).toBeUndefined();
  });

  it('clears all entries', () => {
    manager.add({ original: 'prompt', revised: 'Prompt.', modifier: 'default', accepted: true });
    manager.clear();
    expect(manager.getAll()).toHaveLength(0);
  });

  it('respects maxEntries limit', () => {
    const smallManager = new HistoryManager(new InMemoryStorage(), 3);
    for (let i = 0; i < 5; i++) {
      smallManager.add({ original: `p${i}`, revised: `P${i}.`, modifier: 'default', accepted: true });
    }
    expect(smallManager.getAll()).toHaveLength(3);
  });

  it('export returns valid JSON', () => {
    manager.add({ original: 'test', revised: 'Test.', modifier: 'default', accepted: true });
    const json = manager.export();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].original).toBe('test');
  });
});
