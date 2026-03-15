import { describe, it, expect } from 'vitest';
import { computeDiff, formatDiffForDisplay, formatDiffMarkdown } from '../diff';

describe('computeDiff', () => {
  it('returns empty array for identical strings', () => {
    const chunks = computeDiff('hello world', 'hello world');
    const hasChanges = chunks.some((c) => c.type !== 'equal');
    expect(hasChanges).toBe(false);
  });

  it('detects insertions', () => {
    const chunks = computeDiff('fix bug', 'fix the bug');
    const inserts = chunks.filter((c) => c.type === 'insert');
    expect(inserts.length).toBeGreaterThan(0);
  });

  it('detects deletions', () => {
    const chunks = computeDiff('fix the bug', 'fix bug');
    const deletes = chunks.filter((c) => c.type === 'delete');
    expect(deletes.length).toBeGreaterThan(0);
  });

  it('chunk types are only equal, insert, or delete', () => {
    const chunks = computeDiff('foo bar', 'foo baz qux');
    const validTypes = new Set(['equal', 'insert', 'delete']);
    for (const chunk of chunks) {
      expect(validTypes.has(chunk.type)).toBe(true);
    }
  });
});

describe('formatDiffMarkdown', () => {
  it('returns "No significant changes" message for identical text', () => {
    const result = formatDiffMarkdown('hello', 'hello');
    expect(result).toContain('No significant changes');
  });

  it('includes original and revised sections for different text', () => {
    const result = formatDiffMarkdown('fix bug', 'Fix the bug.');
    expect(result).toContain('Original');
    expect(result).toContain('Revised');
  });
});
