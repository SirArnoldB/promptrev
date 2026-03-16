# PromptRev — Product Requirements Document (PRD)

**Version:** 0.1.0  
**Status:** Pre-build / Design Phase  
**Last Updated:** March 2026

---

## 1. Executive Summary

PromptRev is a developer tool that automatically enhances, polishes, and refines prompts before they are sent to an AI agent. It works as a VS Code extension (supporting VS Code and Visual Studio), a CLI npm package, and a standalone SDK — meeting developers wherever they work. Users trigger enhancements via the `@rev` chat participant command or a global keybinding, with configurable polishing modes (modifiers) that control the depth, tone, and goal of each enhancement.

---

## 2. Problem Statement

### 2.1 Core Pain Points

**For individual developers:**
- Writing good AI prompts is a skill that takes time to develop. Vague or poorly structured prompts produce poor results, wasting time in back-and-forth iterations.
- Context is often missing — developers know their codebase but forget to include relevant details (language, framework, constraints) in prompts.
- Prompts typed in flow state are often rushed — typos, incomplete thoughts, missing output format requirements.
- There is no feedback loop between prompt quality and output quality unless the developer is already trained in prompt engineering.

**For teams:**
- Different developers produce wildly inconsistent prompt quality, leading to inconsistent AI output quality.
- No shared standard for how to prompt the AI for a given codebase or domain.
- Junior developers get worse results from AI tools not because the tools are worse for them, but because their prompts are weaker.

**For power users:**
- Even experienced prompt engineers have to manually apply context (tech stack, constraints, output format) to every prompt — repetitive and friction-heavy.
- Switching between tasks (architecture thinking vs quick bug fix vs code review) requires mentally shifting prompt style — no tooling supports this.

### 2.2 The Gap in Existing Solutions

| Tool | What it does | What it misses |
|---|---|---|
| PromptDC | One-click enhancement via keyboard shortcut | No modifier system, no model reuse, limited configurability |
| GitHub Copilot Chat | Answers prompts | Does not improve the prompts themselves |
| Manual prompt templates | Reusable snippets | Static, not context-aware, no inline flow |
| MCP prompt servers | Structured prompt delivery | Overhead, extra process, not inline |

PromptRev fills the gap: **inline, instant, configurable prompt enhancement that reuses the model the developer already has**, with no extra infra, no API key required by default, and a modifier system that adapts to any task type.

---

## 3. Product Vision

> **PromptRev makes every developer a prompt engineer without them needing to think about it.**

The tool is deliberately invisible when you don't need it and instant when you do. It does not replace the AI — it improves what you say to the AI, in the moment, with zero workflow disruption.

---

## 4. Target Users

| Persona | Description | Primary Need |
|---|---|---|
| **The Flow Developer** | Writes prompts fast and dirty, wants results without slowing down | `:fast` mode, auto-accept, instant |
| **The Architect** | Working on system design, needs prompts that produce structured thinking | `:architect` and `:deep` modes |
| **The Junior Dev** | Doesn't yet know how to write good prompts | Default enhancement, spell check, gentle rewrites |
| **The Team Lead** | Wants consistent AI output across the team | Custom modifier definitions, shared config |
| **The CLI Developer** | Works primarily in the terminal, not VS Code | npm package / CLI integration |

---

## 5. Features

### 5.1 Core Features (v1.0)

#### F1 — `@rev` Chat Participant
- Registers as a first-class VS Code Chat Participant (`@rev`)
- Appears in chat autocomplete natively
- Intercepts the raw user prompt, enhances it, returns the polished version as a diff-style preview
- Works in Copilot Chat, any VS Code chat panel that supports the Chat Participant API

#### F2 — Global Keybinding
- Default: `Cmd+Shift+E` (Mac) / `Ctrl+Shift+E` (Win/Linux)
- Operates on selected text in any editor or chat input
- If no text is selected, operates on the entire current input field content
- Fully remappable in VS Code keybindings

#### F3 — Modifier System
Built-in modifiers, all user-configurable:

| Modifier | Trigger | Behavior |
|---|---|---|
| Default | `@rev your prompt` | Grammar, clarity, structure, missing context injection |
| `:fast` | `@rev:fast your prompt` | Minimal rewrite — sharpens and tightens only. Rule-based option for zero latency |
| `:deep` | `@rev:deep your prompt` | Adds chain-of-thought framing, edge cases, exhaustive constraints |
| `:architect` | `@rev:architect your prompt` | Reframes toward system design, trade-offs, scalability |
| `:critic` | `@rev:critic your prompt` | Adds failure modes, steelman opposite approach, identify assumptions |
| `:spell` | `@rev:spell your prompt` | Spelling and grammar only — no structural changes |
| `:spec` | `@rev:spec your prompt` | Converts vague idea into structured spec with acceptance criteria |

Users can define their own modifiers in `settings.json`.

#### F4 — Accept/Reject Diff Flow
- Enhanced prompt appears as an inline diff (original vs revised)
- Three actions: **Accept & Send**, **Edit First**, **Dismiss**
- Configurable per-modifier: some modes default to auto-accept (`:fast`), others default to diff (`:deep`)
- `autoSend` flag controls whether accepted prompts are automatically sent to the LLM

#### F5 — Model Reuse via `vscode.lm`
- Uses VS Code's Language Model API to route through whatever model the user already has active (Copilot, Claude, Gemini, etc.)
- No separate API key required by default
- Fallback chain: `vscode.lm` → user-configured API key → local rule-based (`:fast` only)

#### F6 — Prompt History Panel
- Sidebar panel showing recent enhancement history
- Each entry shows: original prompt, revised prompt, modifier used, timestamp
- One-click restore of original
- Exportable as JSON

#### F7 — Spell & Prompt Quality Linting
- Baked into every enhancement pass by default (LLM fixes typos automatically)
- `:spell` as explicit light-touch mode (grammar/spelling only, no rewrites)
- Optional: inline squiggles on detected vague/low-quality prompts (configurable, off by default)

---

### 5.2 Configuration

All configuration lives in VS Code `settings.json` and an optional `.promptrev.json` project-level config file.

```json
{
  "promptrev.acceptMode": "diff",
  "promptrev.autoSend": false,
  "promptrev.keepHistory": true,
  "promptrev.defaultModifier": "default",
  "promptrev.model": "auto",
  "promptrev.domainContext": "React + TypeScript, Node.js backend, PostgreSQL",
  "promptrev.modifiers": {
    "fast": { "acceptMode": "auto", "autoSend": true },
    "deep": { "acceptMode": "diff", "autoSend": false },
    "mymode": {
      "systemPrompt": "You are a prompt engineer specializing in data science tasks. Rewrite the prompt to be precise, include dataset context, and specify expected output format.",
      "acceptMode": "diff"
    }
  }
}
```

---

### 5.3 Future Features (Post-v1.0)

- **Team shared modifier library** — `.promptrev.json` committed to the repo, shared across all team members
- **Prompt analytics** — track which modifiers produce the best outcomes (user-rated)
- **Voice prompt support** — pipe voice transcripts through `@rev` before sending
- **Custom UI panel** — dedicated sidebar with a first-class input box and button toolbar (for environments where `@rev` isn't available)
- **JetBrains / Neovim plugin** — expand beyond VS Code
- **`@rev` in GitHub PR comments** — polish prompts in code review contexts

---

## 6. Non-Goals (v1.0)

- PromptRev does **not** replace the AI model — it only prepares input to it
- PromptRev does **not** store prompts remotely or send data anywhere except the configured LLM endpoint
- PromptRev does **not** inject a custom UI into Copilot Chat's input box (not exposed by VS Code's API)
- PromptRev does **not** require an MCP server or any background process

---

## 7. Tech Stack

### 7.1 VS Code Extension

| Layer | Technology | Reason |
|---|---|---|
| Extension runtime | TypeScript | VS Code extension standard; type-safe |
| VS Code APIs | `vscode.lm` (Language Model API), `vscode.chat` (Chat Participant API) | Native model reuse, native `@rev` participant |
| Bundler | esbuild | Fast, minimal output, standard for VS Code extensions |
| Testing | `@vscode/test-electron` + Mocha | Official VS Code extension testing framework |
| Packaging | `vsce` (VS Code Extension CLI) | Marketplace publishing |
| Visual Studio (non-Code) | VSIX packaging (same output) | VS Code and Visual Studio share VSIX format |

### 7.2 npm / CLI Package

| Layer | Technology | Reason |
|---|---|---|
| Language | TypeScript | Shared codebase with extension |
| CLI framework | `commander` | Lightweight, widely used |
| LLM client | `@anthropic-ai/sdk` + `openai` (optional peer deps) | User brings their own key for CLI context |
| Build | `tsup` | Outputs both CJS and ESM; DX-friendly |
| Package manager | npm / pnpm workspace | Monorepo shared core |

### 7.3 Monorepo Structure

```
promptrev/
├── packages/
│   ├── core/              ← Shared enhancement logic (TypeScript)
│   │   ├── enhancer.ts    ← Main enhancement engine
│   │   ├── modifiers.ts   ← Modifier definitions and system prompts
│   │   ├── diff.ts        ← Diff generation utilities
│   │   └── history.ts     ← History management
│   ├── vscode/            ← VS Code extension
│   │   ├── extension.ts   ← Extension entry point
│   │   ├── participant.ts ← @rev chat participant
│   │   ├── keybinding.ts  ← Global keybinding handler
│   │   └── panel.ts       ← History sidebar panel
│   └── cli/               ← npm CLI package
│       ├── index.ts        ← SDK exports
│       └── bin/rev.ts      ← CLI entry point
├── package.json            ← Workspace root
└── tsconfig.base.json
```

### 7.4 Key Dependencies

```json
{
  "core": {
    "diff": "^5.0.0",
    "zod": "^3.0.0"
  },
  "vscode": {
    "@types/vscode": "^1.85.0"
  },
  "cli": {
    "commander": "^12.0.0",
    "@anthropic-ai/sdk": "^0.20.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "esbuild": "^0.20.0",
    "tsup": "^8.0.0",
    "pnpm": "^9.0.0"
  }
}
```

### 7.5 Publishing Targets

| Target | Registry | Command |
|---|---|---|
| VS Code Extension | VS Code Marketplace | `vsce publish` |
| Visual Studio Extension | Visual Studio Marketplace | Same VSIX |
| npm package (SDK) | npmjs.com | `npm publish` |
| CLI tool | npmjs.com | `npx promptrev` or `npm i -g promptrev` |

---

## 8. Success Metrics

| Metric | Target (3 months post-launch) |
|---|---|
| VS Code Marketplace installs | 1,000+ |
| Weekly active users | 300+ |
| Average enhancement latency | < 600ms |
| User-rated prompt improvement | > 4/5 (in-extension feedback) |
| Modifier usage distribution | > 3 modifiers actively used per power user |

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `vscode.lm` API availability varies by user setup | Fallback to user API key, then rule-based for `:fast` |
| Enhancement latency frustrates users | Stream results, model selection defaults to Haiku/mini, `:fast` is rule-based |
| Users don't discover modifiers | Autocomplete shows all modifiers with descriptions in chat |
| Prompt history grows large | Local storage with configurable max entries (default 100) |
| VS Code injects `@rev` into actual AI request | Extension intercepts and replaces before forwarding — handled by Chat Participant API design |
