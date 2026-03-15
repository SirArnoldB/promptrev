import { diffWords } from 'diff';

export interface DiffChunk {
  type: 'equal' | 'insert' | 'delete';
  value: string;
}

/**
 * Computes a word-level diff between original and revised text.
 */
export function computeDiff(original: string, revised: string): DiffChunk[] {
  const changes = diffWords(original, revised);
  return changes.map((change) => ({
    type: change.added ? 'insert' : change.removed ? 'delete' : 'equal',
    value: change.value,
  }));
}

/**
 * Formats diff chunks as a markdown string suitable for display in chat.
 */
export function formatDiffForDisplay(chunks: DiffChunk[]): string {
  return chunks
    .map((chunk) => {
      switch (chunk.type) {
        case 'insert':
          return `**${chunk.value}**`;
        case 'delete':
          return `~~${chunk.value}~~`;
        case 'equal':
          return chunk.value;
      }
    })
    .join('');
}

/**
 * Formats the full diff comparison as a markdown block for chat display.
 */
export function formatDiffMarkdown(original: string, revised: string): string {
  if (original.trim() === revised.trim()) {
    return `**No significant changes needed.**\n\n> ${original}`;
  }

  return [
    '**Original:**',
    `> ${original}`,
    '',
    '**Revised:**',
    `> ${revised}`,
  ].join('\n');
}
