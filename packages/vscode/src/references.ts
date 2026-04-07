import * as vscode from 'vscode';
import * as path from 'path';

// ── Types ──────────────────────────────────────────────────────────────────────

export type ReferenceMode = 'passthrough' | 'contextAware';

export interface ParsedReference {
  id: string;
  name: string;
  uri?: vscode.Uri;
  range?: vscode.Range;
  type: 'file' | 'folder' | 'selection' | 'other';
  rawRef: vscode.ChatPromptReference;
}

export interface ParsedReferences {
  all: ParsedReference[];
  files: ParsedReference[];
  folders: ParsedReference[];
  selections: ParsedReference[];
  other: ParsedReference[];
}

// ── Extract & Classify ─────────────────────────────────────────────────────────

export async function extractReferences(request: vscode.ChatRequest): Promise<ParsedReferences> {
  const parsed: ParsedReferences = {
    all: [],
    files: [],
    folders: [],
    selections: [],
    other: [],
  };

  for (const ref of request.references) {
    let entry: ParsedReference;

    if (ref.id === 'vscode.file' && ref.value instanceof vscode.Uri) {
      const uri = ref.value as vscode.Uri;
      let isFolder = false;
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        isFolder = stat.type === vscode.FileType.Directory;
      } catch {
        // If stat fails, assume file
      }

      entry = {
        id: ref.id,
        name: path.basename(uri.fsPath),
        uri,
        type: isFolder ? 'folder' : 'file',
        rawRef: ref,
      };
    } else if (
      ref.id === 'vscode.file' &&
      ref.value &&
      typeof (ref.value as any).uri !== 'undefined'
    ) {
      // vscode.Location — a file with a specific range
      const loc = ref.value as vscode.Location;
      entry = {
        id: ref.id,
        name: path.basename(loc.uri.fsPath),
        uri: loc.uri,
        range: loc.range,
        type: 'file',
        rawRef: ref,
      };
    } else if (ref.id === 'copilot.selection' || ref.id === 'vscode.selection') {
      entry = {
        id: ref.id,
        name: '#selection',
        type: 'selection',
        rawRef: ref,
      };
    } else {
      entry = { id: ref.id, name: ref.id, type: 'other', rawRef: ref };
    }

    parsed.all.push(entry);

    switch (entry.type) {
      case 'file':
        parsed.files.push(entry);
        break;
      case 'folder':
        parsed.folders.push(entry);
        break;
      case 'selection':
        parsed.selections.push(entry);
        break;
      default:
        parsed.other.push(entry);
    }
  }

  return parsed;
}

// ── Passthrough Context ────────────────────────────────────────────────────────

export function buildPassthroughContext(refs: ParsedReferences): string {
  const parts: string[] = [];

  if (refs.files.length > 0) {
    const fileList = refs.files
      .map((f) => {
        const rangeInfo = f.range
          ? ` (lines ${f.range.start.line + 1}-${f.range.end.line + 1})`
          : '';
        return `  - ${f.name}${rangeInfo}`;
      })
      .join('\n');
    parts.push(`Attached files:\n${fileList}`);
  }

  if (refs.folders.length > 0) {
    const folderList = refs.folders.map((f) => `  - ${f.name}/`).join('\n');
    parts.push(`Attached folders:\n${folderList}`);
  }

  if (refs.selections.length > 0) {
    parts.push('Current editor selection is also attached as context.');
  }

  return parts.length > 0
    ? parts.join('\n') + '\n\nThese are attached as context and will be sent alongside the prompt.'
    : '';
}

// ── Re-emit References ─────────────────────────────────────────────────────────

export function emitReferences(stream: vscode.ChatResponseStream, refs: ParsedReferences): void {
  for (const ref of refs.all) {
    if (ref.uri) {
      stream.reference(ref.uri);
    }
  }
}

// ── Config Resolution ──────────────────────────────────────────────────────────

export function resolveReferenceMode(modifier: string): ReferenceMode {
  const config = vscode.workspace.getConfiguration('promptrev');

  // Check per-modifier override
  const modifierOverrides = config.get<Record<string, any>>('modifiers', {});
  const modOverride = modifierOverrides[modifier]?.referenceMode;
  if (modOverride === 'passthrough' || modOverride === 'contextAware') {
    return modOverride;
  }

  // Fall back to global setting
  const global = config.get<string>('referenceMode', 'passthrough');
  return global === 'contextAware' ? 'contextAware' : 'passthrough';
}
