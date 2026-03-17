# PromptRev — Technical Specification & Build Guide

**Version:** 0.1.0  
**Status:** Pre-build  
**Last Updated:** March 2026

---

## 1. Architecture Overview

PromptRev is structured as a **pnpm monorepo** with three packages:

```
promptrev/
├── packages/
│   ├── core/        ← Shared enhancement engine (no VS Code deps)
│   ├── vscode/      ← VS Code/Visual Studio extension
│   └── cli/         ← npm SDK + CLI binary
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

The `core` package contains all business logic. Both `vscode` and `cli` depend on `core` and adapt it to their environment (VS Code APIs vs Node.js/CLI).

---

## 2. Package: `core`

### Purpose
The enhancement engine. No runtime dependencies on VS Code or Node-specific I/O. Pure TypeScript, usable anywhere.

### Key Modules

#### `enhancer.ts`
The central orchestrator. Takes a raw prompt + modifier + model adapter, returns an enhanced prompt.

```typescript
export interface EnhancerInput {
  rawPrompt: string;
  modifier: ModifierKey;         // 'default' | 'rb' | 'deep' | 'architect' | 'critic' | 'spell' | 'spec' | string
  domainContext?: string;        // e.g. "React + TypeScript, Node.js"
  modelAdapter: ModelAdapter;    // abstraction over vscode.lm or Anthropic SDK
}

export interface EnhancerOutput {
  original: string;
  revised: string;
  modifier: ModifierKey;
  timestamp: number;
  skipped: boolean;              // true if prompt was too short / already good
  diff: DiffChunk[];
}

export async function enhance(input: EnhancerInput): Promise<EnhancerOutput>
```

#### `modifiers.ts`
Modifier definitions — maps modifier keys to system prompts and default config.

```typescript
export interface ModifierDefinition {
  key: string;
  label: string;
  description: string;
  systemPrompt: string;
  acceptMode: 'diff' | 'auto';
  autoSend: boolean;
  useLLM: boolean;               // false = rule-based only (rb mode)
}

export const BUILT_IN_MODIFIERS: Record<string, ModifierDefinition> = {
  default: { ... },
  rb: { useLLM: false, acceptMode: 'auto', autoSend: true, ... },
  deep: { useLLM: true, acceptMode: 'diff', autoSend: false, ... },
  architect: { ... },
  critic: { ... },
  spell: { ... },
  spec: { ... },
};

export function resolveModifier(
  key: string,
  userModifiers: Record<string, Partial<ModifierDefinition>>
): ModifierDefinition
```

#### `model-adapter.ts`
Abstract interface over any LLM provider. Both VS Code and CLI implement this.

```typescript
export interface ModelAdapter {
  complete(
    systemPrompt: string,
    userMessage: string,
    signal?: AbortSignal
  ): Promise<string>;
}

// VS Code implementation (uses vscode.lm)
export class VSCodeModelAdapter implements ModelAdapter { ... }

// CLI/SDK implementation (uses Anthropic SDK or OpenAI)
export class AnthropicModelAdapter implements ModelAdapter { ... }

// Rule-based fallback (no LLM)
export class RuleBasedAdapter implements ModelAdapter { ... }
```

#### `diff.ts`
Diff generation between original and revised prompt.

```typescript
export interface DiffChunk {
  type: 'equal' | 'insert' | 'delete';
  value: string;
}

export function computeDiff(original: string, revised: string): DiffChunk[]
export function formatDiffForDisplay(chunks: DiffChunk[]): string
```

#### `history.ts`
In-memory + persistent history management.

```typescript
export interface HistoryEntry {
  id: string;
  original: string;
  revised: string;
  userEdited?: string;
  modifier: string;
  timestamp: number;
  accepted: boolean;
}

export class HistoryManager {
  add(entry: HistoryEntry): void
  getAll(): HistoryEntry[]
  restore(id: string): string       // returns original prompt
  export(): string                   // JSON string
  clear(): void
}
```

#### `rule-based.ts`
Local rule-based enhancement for `:rb` (no LLM).

```typescript
// Rules applied in order:
// 1. Fix common spelling (levenshtein distance on known dev words)
// 2. Remove filler phrases ("idk", "or something", "maybe", "kinda")
// 3. Ensure ends with punctuation
// 4. Capitalize first letter
// 5. If missing a verb, prepend "Please"
export function ruleBasedEnhance(raw: string): string
```

---

## 3. Package: `vscode`

### Purpose
VS Code extension entry point. Registers the `@rev` Chat Participant, global keybinding, history panel, and connects everything to `core` via the VS Code Model Adapter.

### Key Files

#### `extension.ts` — Entry point

```typescript
import * as vscode from 'vscode';
import { registerParticipant } from './participant';
import { registerKeybinding } from './keybinding';
import { HistoryPanel } from './panel';

export function activate(context: vscode.ExtensionContext) {
  registerParticipant(context);
  registerKeybinding(context);
  HistoryPanel.register(context);
}

export function deactivate() {}
```

#### `participant.ts` — `@rev` Chat Participant

```typescript
import * as vscode from 'vscode';
import { enhance } from '@promptrev/core';
import { VSCodeModelAdapter } from '@promptrev/core/model-adapter';
import { parseModifier } from './utils';

export function registerParticipant(context: vscode.ExtensionContext) {
  const participant = vscode.chat.createChatParticipant('promptrev.rev', handler);
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icons', 'rev.png');
  
  // Register all modifiers as slash commands for autocomplete
  participant.followupProvider = { ... };
  
  context.subscriptions.push(participant);
}

async function handler(
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
) {
  const { modifier, rawPrompt } = parseModifier(request.prompt);
  const config = vscode.workspace.getConfiguration('promptrev');
  
  const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
  const adapter = models.length > 0 
    ? new VSCodeModelAdapter(models[0], token) 
    : new RuleBasedAdapter();

  const result = await enhance({
    rawPrompt,
    modifier,
    domainContext: config.get('domainContext'),
    modelAdapter: adapter,
  });

  // Stream diff preview to chat
  stream.markdown(formatDiffMarkdown(result));
  
  // Render action buttons
  stream.button({ command: 'promptrev.accept', title: '✓ Accept & Send', arguments: [result] });
  stream.button({ command: 'promptrev.edit', title: '✎ Edit First', arguments: [result] });
  stream.button({ command: 'promptrev.dismiss', title: '✗ Dismiss', arguments: [result] });
}
```

#### `keybinding.ts` — Global keybinding handler

```typescript
export function registerKeybinding(context: vscode.ExtensionContext) {
  const cmd = vscode.commands.registerCommand('promptrev.enhanceSelection', async () => {
    const editor = vscode.window.activeTextEditor;
    const selection = editor?.selection;
    const text = editor?.document.getText(selection) ?? '';
    
    if (!text.trim()) {
      vscode.window.showInformationMessage('PromptRev: Select some text to enhance.');
      return;
    }
    
    const result = await enhance({ rawPrompt: text, modifier: 'default', ... });
    
    // Show inline diff
    await showInlineDiff(editor!, selection!, result);
  });
  
  context.subscriptions.push(cmd);
}
```

#### `panel.ts` — History Sidebar Panel (WebviewViewProvider)

```typescript
export class HistoryPanel implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.html = getHistoryHTML(historyManager.getAll());
    
    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'restore') { /* restore original to clipboard/editor */ }
      if (msg.type === 'export') { /* write promptrev-history.json */ }
      if (msg.type === 'clear') { historyManager.clear(); }
    });
  }
}
```

### `package.json` Manifest (Key Sections)

```json
{
  "name": "promptrev",
  "displayName": "PromptRev",
  "description": "Instantly enhance your AI prompts with @rev",
  "version": "1.0.0",
  "publisher": "your-publisher-id",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["AI", "Other"],
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "chatParticipants": [{
      "id": "promptrev.rev",
      "name": "rev",
      "description": "Enhance your prompt before sending it to the AI",
      "isSticky": false,
      "commands": [
        { "name": "rb",      "description": "Quick sharpen — auto-accept, rule-based" },
        { "name": "deep",      "description": "Exhaustive — chain-of-thought, edge cases" },
        { "name": "architect", "description": "System design framing" },
        { "name": "critic",    "description": "Adversarial review framing" },
        { "name": "spell",     "description": "Grammar and spelling only" },
        { "name": "spec",      "description": "Convert idea to structured spec" }
      ]
    }],
    "commands": [
      {
        "command": "promptrev.enhanceSelection",
        "title": "PromptRev: Enhance Selected Text"
      }
    ],
    "keybindings": [
      {
        "command": "promptrev.enhanceSelection",
        "key": "ctrl+shift+e",
        "mac": "cmd+shift+e"
      }
    ],
    "configuration": {
      "title": "PromptRev",
      "properties": {
        "promptrev.acceptMode": {
          "type": "string",
          "enum": ["diff", "auto", "preview"],
          "default": "diff"
        },
        "promptrev.autoSend": { "type": "boolean", "default": false },
        "promptrev.keepHistory": { "type": "boolean", "default": true },
        "promptrev.domainContext": { "type": "string", "default": "" },
        "promptrev.modifiers": { "type": "object", "default": {} }
      }
    },
    "views": {
      "explorer": [{
        "type": "webview",
        "id": "promptrev.history",
        "name": "PromptRev History"
      }]
    }
  }
}
```

---

## 4. Package: `cli`

### SDK Usage

```typescript
import { enhance, modifiers } from 'promptrev';

const result = await enhance({
  rawPrompt: 'fix the race condition in my queue worker',
  modifier: 'deep',
  apiKey: process.env.ANTHROPIC_API_KEY,
  domainContext: 'Node.js, Bull queue, Redis',
});

console.log(result.revised);
```

### CLI Usage

```bash
# Install globally
npm install -g promptrev

# Enhance a prompt
rev "fix the race condition in my queue worker"

# With modifier
rev --mod deep "design a job queue system"

# Pipe
echo "fix null check" | rev --mod rb

# From file
rev --file prompt.txt --mod architect

# Output as JSON
rev --json "fix the bug" 

# List available modifiers
rev --list-modifiers
```

### CLI Entry Point (`bin/rev.ts`)

```typescript
#!/usr/bin/env node
import { program } from 'commander';
import { enhance } from '../index';

program
  .name('rev')
  .description('PromptRev CLI — enhance your AI prompts')
  .argument('[prompt]', 'Prompt to enhance')
  .option('-m, --mod <modifier>', 'Modifier to use', 'default')
  .option('-f, --file <path>', 'Read prompt from file')
  .option('--json', 'Output as JSON')
  .option('--list-modifiers', 'List available modifiers')
  .action(async (prompt, options) => {
    if (options.listModifiers) { /* print table */ return; }
    
    const raw = options.file 
      ? fs.readFileSync(options.file, 'utf8') 
      : prompt ?? (await readStdin());
    
    const result = await enhance({
      rawPrompt: raw,
      modifier: options.mod,
      apiKey: process.env.PROMPTREV_API_KEY 
           ?? process.env.ANTHROPIC_API_KEY
           ?? process.env.OPENAI_API_KEY,
    });
    
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.revised);
    }
  });

program.parse();
```

---

## 5. Scaffolding Steps

### Step 1 — Initialize Monorepo

```bash
mkdir promptrev && cd promptrev
pnpm init
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

---

### Step 2 — Scaffold `core` Package

```bash
cd packages && mkdir core && cd core
pnpm init
pnpm add diff zod
pnpm add -D typescript tsup @types/node
```

File structure:
```
packages/core/
├── src/
│   ├── index.ts          ← re-exports everything
│   ├── enhancer.ts
│   ├── modifiers.ts
│   ├── model-adapter.ts
│   ├── diff.ts
│   ├── history.ts
│   └── rule-based.ts
├── tsup.config.ts
└── package.json
```

`tsup.config.ts`:
```typescript
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
});
```

**Build order:** Write and test `core` first before touching `vscode` or `cli`. The core must be model-agnostic — no `vscode` or `process.env` references.

---

### Step 3 — Scaffold `vscode` Extension

```bash
cd packages && npx --package yo --package generator-code yo code
# Choose: New Extension (TypeScript)
# Name: promptrev
# Then override with our structure
```

Or manually:
```bash
mkdir vscode && cd vscode
pnpm init
pnpm add @promptrev/core
pnpm add -D @types/vscode typescript esbuild @vscode/test-electron
```

Add to `package.json`:
```json
{
  "main": "./dist/extension.js",
  "scripts": {
    "build": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --platform=node",
    "watch": "npm run build -- --watch",
    "test": "node ./test/runTest.js",
    "package": "vsce package",
    "publish": "vsce publish"
  }
}
```

`.vscodeignore`:
```
.vscode/**
src/**
node_modules/**
*.ts
!dist/**
```

---

### Step 4 — Scaffold `cli` Package

```bash
cd packages && mkdir cli && cd cli
pnpm init
pnpm add @promptrev/core commander @anthropic-ai/sdk
pnpm add -D typescript tsup @types/node
```

`package.json`:
```json
{
  "name": "promptrev",
  "bin": { "rev": "./dist/bin/rev.js" },
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  }
}
```

---

### Step 5 — System Prompt Templates

These go in `core/src/modifiers.ts`. These are the actual LLM system prompts sent during enhancement:

**Default modifier system prompt:**
```
You are a prompt engineering assistant. Your job is to rewrite the user's raw prompt 
to be clearer, more specific, and more likely to produce a high-quality AI response.

Rules:
- Preserve the original intent exactly
- Add missing context (specify language/framework if implied)
- Add output format requirements if missing
- Fix grammar and spelling
- Remove vague filler language
- Do not make the prompt longer than necessary
- Return ONLY the rewritten prompt — no explanation, no preamble

Domain context (if provided): {domainContext}
```

**Deep modifier system prompt:**
```
You are a senior prompt engineer. Rewrite this prompt to elicit an exhaustive, 
structured, expert-level response from an AI.

Add:
- Step-by-step / chain-of-thought instruction
- Request for edge case coverage
- Request for trade-off analysis where relevant
- Output structure (numbered sections, headers)
- "Think step by step" closing instruction

Return ONLY the rewritten prompt.
```

---

### Step 6 — Testing Plan

| Test Type | Location | Tool |
|---|---|---|
| Unit tests for `core` | `packages/core/tests/` | Vitest |
| Enhancement output quality | `packages/core/tests/fixtures/` | Snapshot tests |
| VS Code extension integration | `packages/vscode/test/` | `@vscode/test-electron` + Mocha |
| CLI end-to-end | `packages/cli/tests/` | Vitest + execa |

**Core tests to write first:**
- `enhancer.test.ts` — given raw prompt + modifier, returns enhanced output
- `rule-based.test.ts` — rule-based cleanup for `:rb` mode
- `modifiers.test.ts` — modifier resolution (built-in + user-defined)
- `diff.test.ts` — diff chunks are accurate

---

### Step 7 — Publishing Checklist

**VS Code Marketplace:**
```bash
# One-time: create publisher at https://marketplace.visualstudio.com/manage
vsce login your-publisher-id
cd packages/vscode
vsce package   # generates promptrev-1.0.0.vsix
vsce publish   # publishes to marketplace
```

**npm (CLI + SDK):**
```bash
cd packages/cli
npm publish --access public
# Users can then: npx promptrev OR npm i -g promptrev
```

---

## 6. Development Workflow

```bash
# Install all dependencies
pnpm install

# Build core first (others depend on it)
pnpm --filter @promptrev/core build

# Watch mode for extension development
pnpm --filter @promptrev/vscode watch

# Press F5 in VS Code to launch Extension Development Host

# Run all tests
pnpm test

# Build everything for release
pnpm -r build
```

---

## 7. Environment Variables (CLI)

| Variable | Purpose |
|---|---|
| `PROMPTREV_API_KEY` | Primary API key (Anthropic by default) |
| `ANTHROPIC_API_KEY` | Anthropic fallback |
| `OPENAI_API_KEY` | OpenAI fallback |
| `PROMPTREV_MODEL` | Override model (e.g. `claude-haiku-4-20250514`) |
| `PROMPTREV_MODIFIER` | Override default modifier |

---

## 8. Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Monorepo tool | pnpm workspaces | Fast, disk-efficient, clean workspace protocol |
| Extension bundler | esbuild | Fastest, smallest output, VS Code standard |
| CLI bundler | tsup | Outputs CJS + ESM, DTS, minimal config |
| LLM for VS Code | `vscode.lm` first | Zero setup for user, reuses existing model |
| LLM for CLI | Anthropic SDK | Direct, reliable, Haiku is fast and cheap |
| `:rb` mode | Rule-based (no LLM) | True no model required — the whole promise of :rb |
| Diff display | In-chat markdown | No custom UI injection needed, works natively |
| History storage | VS Code `globalState` | Built-in, no extra dependencies, survives restarts |
