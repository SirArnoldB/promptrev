# PromptRev — File References & Context Preservation Fix

**Issue:** When users attach files via `#file:`, `#selection`, or other VS Code chat variables, PromptRev's `@rev` participant loses those references during prompt enhancement. The enhanced prompt is sent as plain text without the original file attachments.

**Impact:** High — this breaks the most common VS Code Chat workflow (attaching code context before prompting).

---

## Root Cause Analysis

### How VS Code Chat References Work

When a user types `@rev please review this file #file:enhancer.ts`, VS Code parses this into a `ChatRequest` object with two key properties:

```typescript
interface ChatRequest {
  prompt: string; // "please review this file"
  references: ChatPromptReference[]; // [{id: 'vscode.file', value: Uri, range: [start, end]}]
  command?: string; // slash command if used
  toolReferences: ChatLanguageModelToolReference[];
  // ...
}
```

The `references` array contains structured data about every `#file:`, `#selection`, `#editor`, etc. that the user attached. The `prompt` string may or may not contain the `#file:xxx` text depending on VS Code version and reference type.

### What PromptRev Currently Does

1. Extracts `request.prompt` (text only)
2. Sends it to the LLM for enhancement
3. Returns the enhanced text via `stream.markdown()`
4. Renders Accept/Edit/Dismiss buttons

### What Gets Lost

- **`request.references`** — the structured file/selection references are never read or forwarded
- **Reference markers in prompt text** — `#file:enhancer.ts` markers may be stripped or rewritten by the LLM
- **File content context** — the LLM enhancer doesn't know what files are attached, so it can't write a context-aware enhanced prompt
- **Re-attachment on send** — when "Send Improved" fires, there's no mechanism to re-attach the original references

---

## Design: Reference Mode

References (attached files, folders, selections) can be large — users can attach entire directories. Reading their contents during enhancement would blow token budgets, add latency, and increase cost just to polish a prompt. So we introduce a **two-mode** system:

### `passthrough` (default)

- References are **captured and preserved** — but their contents are never read
- The enhancer receives only filenames/paths as metadata (e.g. "user attached `enhancer.ts` and `diff.ts`"), enough to write a contextually relevant enhanced prompt without reading file bodies
- Zero additional I/O, zero token overhead, zero latency impact
- Suitable for all modifiers and the vast majority of workflows
- References are re-emitted as clickable links in the PromptRev response via `stream.reference()`
- On "Send Improved", missing `#file:` markers are appended to the prompt text as a best-effort restoration

### `contextAware` (opt-in, Phase 2)

- PromptRev reads referenced file contents (within a configurable token budget) and feeds a structural summary to the enhancer
- The enhancer can use this to write a deeply context-aware prompt (e.g. knowing the function signatures, exports, class structure)
- Best suited for `:deep` and `:architect` modifiers where the enhanced prompt quality benefits from knowing code structure
- For folders: reads the **file tree structure only** (names and paths), never recursively reads all file contents
- For large files: reads **first N lines** or **structural summary** (exports, function/class signatures) rather than the full file
- Token budget caps prevent runaway costs regardless of attachment size
- Use VS Code's `DocumentSymbolProvider` API for structural summaries rather than regex parsing
- Use `text.length / 4` heuristic for token estimation (no tiktoken dependency)
- Binary files (images, PDFs, compiled) are detected by extension and skipped during content reading, but still re-emitted as references

### Configuration

```json
{
  "promptrev.referenceMode": "passthrough",
  "promptrev.referenceTokenBudget": 2000,
  "promptrev.modifiers": {
    "deep": {
      "referenceMode": "contextAware",
      "referenceTokenBudget": 3000
    },
    "architect": {
      "referenceMode": "contextAware",
      "referenceTokenBudget": 2000
    },
    "fast": {
      "referenceMode": "passthrough"
    }
  }
}
```

Per-modifier `referenceMode` overrides the global default. If a modifier doesn't specify one, the global `promptrev.referenceMode` is used. `:deep` and `:architect` default to `contextAware` once Phase 2 ships.

---

## Solution

### Layer 1: Capture & Parse References

In `references.ts`, extract references from the request and classify them. This layer runs in **both** modes — it's how we know what's attached regardless of whether we read contents.

The function is `async` to properly await `vscode.workspace.fs.stat()` for file vs folder detection.

```typescript
interface ParsedReference {
  id: string;
  name: string;
  uri?: vscode.Uri;
  range?: vscode.Range;
  type: 'file' | 'folder' | 'selection' | 'other';
  rawRef: vscode.ChatPromptReference; // preserve original for re-emission
}

interface ParsedReferences {
  all: ParsedReference[];
  files: ParsedReference[];
  folders: ParsedReference[];
  selections: ParsedReference[];
  other: ParsedReference[];
}

async function extractReferences(request: vscode.ChatRequest): Promise<ParsedReferences> {
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
    // Classify into typed arrays
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
```

### Layer 2: Build Reference Context (Mode-Dependent)

#### Passthrough mode

The enhancer receives **only metadata** — filenames and types, no file contents:

```typescript
function buildPassthroughContext(refs: ParsedReferences): string {
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
    parts.push(`Current editor selection is also attached as context.`);
  }

  return parts.length > 0
    ? parts.join('\n') + '\n\nThese are attached as context and will be sent alongside the prompt.'
    : '';
}
```

#### Context-aware mode (Phase 2)

Reads file contents within a token budget, extracts structural summaries:

```typescript
interface ContextAwareOptions {
  tokenBudget: number; // default 2000
}

async function buildContextAwareContext(
  refs: ParsedReferences,
  options: ContextAwareOptions
): Promise<string> {
  let remainingBudget = options.tokenBudget;
  const parts: string[] = [];

  // 1. Folders → file tree only (cheap, always fits)
  for (const folder of refs.folders) {
    if (!folder.uri) continue;
    const tree = await readFileTree(folder.uri, { maxDepth: 3, maxEntries: 50 });
    const treeStr = `Folder structure of ${folder.name}/:\n${tree}`;
    const cost = estimateTokens(treeStr);
    if (cost <= remainingBudget) {
      parts.push(treeStr);
      remainingBudget -= cost;
    }
  }

  // 2. Files → structural summary (exports, signatures, first N lines)
  for (const file of refs.files) {
    if (!file.uri || remainingBudget <= 0) continue;

    const summary = await readFileSummary(file.uri, {
      maxTokens: Math.min(remainingBudget, 500), // per-file cap
      range: file.range,
      strategy: getStrategyForExtension(file.name),
    });

    if (summary) {
      parts.push(`File: ${file.name}\n${summary}`);
      remainingBudget -= estimateTokens(summary);
    }
  }

  // 3. Selections → read from ref.value, not from active editor (avoids stale state)
  for (const sel of refs.selections) {
    const text = extractSelectionText(sel.rawRef);
    if (text && estimateTokens(text) <= remainingBudget) {
      parts.push(`Current selection:\n\`\`\`\n${text}\n\`\`\``);
      remainingBudget -= estimateTokens(text);
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : buildPassthroughContext(refs); // fallback
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

```typescript
/** Read structural summary of a file using DocumentSymbolProvider */
async function readFileSummary(
  uri: vscode.Uri,
  options: { maxTokens: number; range?: vscode.Range; strategy: 'structural' | 'head' }
): Promise<string | null> {
  try {
    // Skip binary files
    if (isBinaryExtension(uri.fsPath)) return null;

    if (options.strategy === 'structural') {
      // Use VS Code's DocumentSymbolProvider for reliable symbol extraction
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
      );
      if (symbols?.length) {
        return formatSymbolTree(symbols, options.maxTokens);
      }
    }

    // Fallback: read head of file
    const doc = await vscode.workspace.openTextDocument(uri);
    const fullText = options.range ? doc.getText(options.range) : doc.getText();
    return truncateToTokenBudget(fullText, options.maxTokens);
  } catch {
    return null; // file unreadable (binary, too large, etc.)
  }
}

/** Determine read strategy based on file extension */
function getStrategyForExtension(name: string): 'structural' | 'head' {
  const ext = path.extname(name).toLowerCase();
  const structuralExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.kt'];
  return structuralExts.includes(ext) ? 'structural' : 'head';
}

/** Read a folder as an indented file tree */
async function readFileTree(
  uri: vscode.Uri,
  options: { maxDepth: number; maxEntries: number }
): Promise<string> {
  const entries: string[] = [];
  await walkDir(uri, '', 0, options.maxDepth, options.maxEntries, entries);
  return entries.join('\n');
}
```

#### Wiring it together in the participant handler

```typescript
// In participant.ts handler:

const refs = await extractReferences(request);
const resolvedMode = resolveReferenceMode(modifier);

let referenceContext: string | undefined;
if (refs.all.length > 0) {
  if (resolvedMode === 'contextAware') {
    const budget = resolveTokenBudget(modifier);
    referenceContext = await buildContextAwareContext(refs, { tokenBudget: budget });
  } else {
    referenceContext = buildPassthroughContext(refs);
  }
}

const result = await enhance({
  rawPrompt: request.prompt,
  modifier,
  domainContext,
  modelAdapter: adapter,
  referenceContext, // metadata-only or structural summary, depending on mode
});
```

Update the `EnhancerInput` type in `core`:

```typescript
export interface EnhancerInput {
  rawPrompt: string;
  modifier: ModifierKey;
  domainContext?: string;
  modelAdapter: ModelAdapter;
  referenceContext?: string; // metadata or structural summary of attached refs
}
```

The `referenceContext` is appended to the system prompt dynamically by `appendReferenceContext()` in `enhancer.ts` — it includes both the metadata and a reference preservation instruction. This is applied universally when `referenceContext` is present, so individual modifier system prompts don't need to be edited.

```typescript
function appendReferenceContext(systemPrompt: string, referenceContext?: string): string {
  if (!referenceContext) return systemPrompt;

  return (
    systemPrompt +
    '\n\n' +
    'The user has attached the following context to their prompt:\n' +
    referenceContext +
    '\n\n' +
    'Preserve all file references in the rewritten prompt. If the original prompt contains ' +
    'file references like #file:filename.ts, #selection, or similar markers, preserve them ' +
    'exactly as-is in your rewritten prompt. These are VS Code context markers that attach ' +
    'file content — do not remove, rename, or rephrase them.'
  );
}
```

### Layer 3: Preserve Reference Markers in Enhanced Text

The reference preservation instruction is appended dynamically by `appendReferenceContext()` (see above) rather than hardcoded into each modifier's system prompt. When `referenceContext` is present, the instruction is included automatically. When there are no references, the system prompt is unchanged.

### Layer 4: Re-emit References in the Response

Use `stream.reference()` to attach the original references to PromptRev's response, so the user can see what files were captured. This runs in **both** modes and creates clickable file links in the chat response.

```typescript
function emitReferences(stream: vscode.ChatResponseStream, refs: ParsedReferences): void {
  for (const ref of refs.all) {
    if (ref.uri) {
      stream.reference(ref.uri);
    }
  }
}
```

### Layer 5: Best-Effort Reference Marker Restoration on "Send Improved"

When the user clicks "Send Improved", the enhanced prompt is sent to Copilot Chat via `workbench.action.chat.open`. References are stored alongside the `EnhancerOutput` in the `pendingResults` map (keyed by timestamp), **not** passed as button arguments (VS Code button arguments must be JSON-serializable, and `vscode.Uri`/`ChatPromptReference` objects are not).

On accept, any `#file:` markers that the LLM dropped from the enhanced text are appended:

```typescript
function appendReferenceMarkers(prompt: string, refs?: ParsedReferences): string {
  if (!refs || refs.files.length === 0) return prompt;

  const missingMarkers = refs.files
    .filter((f) => f.uri && !prompt.includes(`#file:${f.name}`))
    .map((f) => `#file:${f.name}`);

  if (missingMarkers.length === 0) return prompt;

  return `${prompt}\n\n${missingMarkers.join(' ')}`;
}
```

The clipboard fallback also includes these markers when `workbench.action.chat.open` is unavailable.

---

## Known Limitations

### Reference forwarding on "Send Improved"

When "Send Improved" opens a new chat via `workbench.action.chat.open`, the `#file:auth.ts` text in the prompt is treated as **plain text** by VS Code — it is not re-parsed into a structured `ChatPromptReference`. This is a VS Code API limitation: there is no programmatic way to inject file references into a new chat request.

**What works:**

- The enhanced prompt text mentions the right files by name (the enhancer knows what's attached)
- References appear as clickable links in the PromptRev response (via `stream.reference()`)
- `#file:` markers are preserved/restored in the prompt text as a visual cue

**What doesn't work:**

- The actual file contents are not automatically sent as context when the enhanced prompt opens in a new chat
- Users who need the file context in the follow-up chat need to manually re-attach their files

This is the most significant limitation of the current approach. It may be addressable in the future if VS Code exposes an API to programmatically open chat with pre-attached references.

---

## Changes by Package

### `@promptrev/core`

| File          | Change                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `enhancer.ts` | Add `referenceContext?: string` to `EnhancerInput`; add `appendReferenceContext()` to inject metadata + preservation instruction |

### `@promptrev/vscode`

| File                 | Change                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `participant.ts`     | Extract `request.references`; resolve reference mode; pass context to enhancer; re-emit via `stream.reference()`; store refs with pending result                 |
| `commands.ts`        | Store `ParsedReferences` alongside `EnhancerOutput` in `pendingResults`; append missing `#file:` markers on accept/send/edit                                     |
| New: `references.ts` | `extractReferences()`, `buildPassthroughContext()`, `emitReferences()`, `resolveReferenceMode()`, types (`ParsedReference`, `ParsedReferences`, `ReferenceMode`) |
| `package.json`       | Add `promptrev.referenceMode` configuration property                                                                                                             |

Phase 2 additions to `references.ts`: `buildContextAwareContext()`, `readFileSummary()`, `readFileTree()`, `estimateTokens()`, binary detection. Phase 2 addition to `package.json`: `promptrev.referenceTokenBudget`.

---

## Implementation Priority

### Phase 1: Passthrough ✅ (implemented)

1. ✅ **Layer 1** — `extractReferences()` in `references.ts` — async, captures and classifies all references, awaits `fs.stat()` for file/folder detection
2. ✅ **Layer 2 (passthrough)** — `buildPassthroughContext()` — pass filenames/metadata to enhancer
3. ✅ **Layer 3** — `appendReferenceContext()` in `enhancer.ts` — dynamically appends reference metadata + preservation instruction to system prompt
4. ✅ **Layer 4** — `emitReferences()` — re-emit references via `stream.reference()` for clickable links
5. ✅ **Layer 5** — `appendReferenceMarkers()` in `commands.ts` — best-effort `#file:` marker restoration on send
6. ✅ **Config** — `promptrev.referenceMode` setting added (default: `"passthrough"`)

### Phase 2: Context-aware (follow-up)

1. **`buildContextAwareContext()`** — file reading with token budget and `text.length / 4` estimation
2. **`readFileSummary()`** — use `DocumentSymbolProvider` API for code files, head-of-file for others
3. **`readFileTree()`** — folder tree reading with depth/entry limits
4. **Binary detection** — skip images, PDFs, compiled files by extension
5. **Selection content** — read from `ref.value` (not active editor) to avoid stale state
6. **Per-modifier config** — wire `referenceTokenBudget` setting and per-modifier overrides
7. **Default `:deep` and `:architect` to `contextAware`** — after testing shows it's stable

---

## Testing Scenarios

### Passthrough mode (default)

| Scenario                                              | Expected Behavior                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@rev fix the bug #file:auth.ts`                      | Enhanced prompt mentions auth.ts by name; `#file:auth.ts` marker preserved; file reference re-emitted in response |
| `@rev review this #file:a.ts #file:b.ts`              | Both files captured, both re-emitted as references, filenames passed as metadata to enhancer                      |
| `@rev:fast fix null check #file:user.ts`              | Rule-based mode preserves `#file:` markers in text; no file I/O                                                   |
| `@rev explain this` (no references)                   | No change from current behavior                                                                                   |
| `@rev /rb fix this #file:main.ts`                     | Slash command + reference both handled correctly                                                                  |
| `@rev refactor #folder:src/`                          | Folder name passed as metadata ("Attached folders: src/"); no recursive read                                      |
| `@rev fix this #file:huge-bundle.min.js` (large file) | File never read; only filename passed to enhancer                                                                 |

### Context-aware mode (opt-in, Phase 2)

| Scenario                                                                        | Expected Behavior                                                                                                    |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `@rev:deep design a cache #file:cache.ts`                                       | File structural summary (via DocumentSymbolProvider) sent to enhancer; enhanced prompt references specific functions |
| `@rev:architect redesign #folder:packages/core/src/`                            | Folder tree read (max 3 levels, 50 entries); file contents NOT read; tree structure sent to enhancer                 |
| `@rev:deep review #file:giant-migration.sql` (10k lines)                        | Only first N lines read within token budget; rest truncated                                                          |
| `@rev:deep fix #file:logo.png` (binary file)                                    | Binary detected by extension, skipped gracefully; still re-emitted as reference                                      |
| `@rev:deep review #file:a.ts #file:b.ts #file:c.ts` (many files)                | Per-file cap (500 tokens) + total budget (3000 tokens) prevent overflow; files read in order until budget exhausted  |
| `@rev:spell fix typos #file:readme.md` (contextAware not configured for :spell) | Falls back to global default (passthrough); file not read                                                            |

### Edge cases

| Scenario                                              | Expected Behavior                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| `@rev:deep fix this #selection`                       | Selection text read from ref.value and included in enhancer context |
| `@rev help` (short prompt + reference)                | Prompt too short → skipped, but references still re-emitted         |
| User cancels mid-enhancement with references          | References cleaned up, no history entry                             |
| Mixed: `@rev review #file:a.ts #selection #file:b.ts` | All three captured; classified by type; all re-emitted              |

---

## Decisions Log

| #   | Question                                               | Decision                                                                                                                                        |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Direct LLM forwarding on "Send Improved" (Strategy A)? | **No** — bypasses Copilot Chat, changes the product model. PromptRev stays a prompt enhancement layer.                                          |
| 2   | Does `stream.reference()` make references clickable?   | **Yes** — confirmed. Creates `ChatResponseReferencePart` entries.                                                                               |
| 3   | How to implement `extractStructuralSummary`?           | Use VS Code's `DocumentSymbolProvider` API — more reliable than regex, works across languages. Phase 2 scope.                                   |
| 4   | Image / binary references?                             | Detect by extension, skip during content reading, still re-emit as references.                                                                  |
| 5   | `contextAware` default for `:deep` and `:architect`?   | **Yes** — users who pick these modifiers want thorough enhancement. Accept the latency tradeoff. Phase 2 scope.                                 |
| 6   | Token estimation strategy?                             | `text.length / 4` heuristic — good enough for budget capping, no tiktoken dependency.                                                           |
| 7   | Button argument serialization?                         | **Store refs in `pendingResults` map by timestamp**, not as button arguments. `vscode.Uri` and `ChatPromptReference` are not JSON-serializable. |
| 8   | Selection reading in contextAware mode?                | **Read from `ref.value`**, not from `vscode.window.activeTextEditor` — editor selection may have changed between message and enhancement.       |
| 9   | Separate `reference-config.ts` file?                   | **No** — `resolveReferenceMode()` is ~15 lines, lives in `references.ts` alongside the other reference utilities.                               |
