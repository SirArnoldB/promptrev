# PromptRev

**Enhance your AI prompts before you send them — directly in VS Code Chat.**

Type `@rev your rough prompt` and get a polished, context-aware version back with a diff showing exactly what changed. No API key required. No background process. Works with whatever model you already have.

---

## Getting started

1. Install the extension
2. Open VS Code Chat (`Ctrl+Alt+I` / `Cmd+Alt+I`)
3. Type `@rev` followed by your prompt

```
@rev fix the bug in my auth module
```

PromptRev enhances the prompt, shows you what changed, and gives you three options: **Send Improved**, **Edit**, or **Send Original**.

---

## Modifiers

Append a `/modifier` to control how your prompt is rewritten:

| Command | What it does |
|---|---|
| `@rev` | Clarity, structure, and missing context — everyday default |
| `@rev /rb` | Rule-based enhancement — no model required, auto-accept |
| `@rev /deep` | Chain-of-thought framing, edge cases, structured output |
| `@rev /architect` | System design framing — trade-offs, components, scalability |
| `@rev /critic` | Adversarial review — failure modes, security, assumptions |
| `@rev /spell` | Grammar and spelling only, no restructuring |
| `@rev /spec` | Converts a vague idea into a structured spec |

---

## Prompt templates

Browse and fill reusable prompt structures with `@rev /template` or `Cmd+Shift+T`:

| Template | Best for |
|---|---|
| `/bug-fix` | Root cause + fix + regression test |
| `/code-review` | Structured review with severity ratings |
| `/architecture` | System design with constraints and trade-offs |
| `/refactor` | Targeted refactor with goals and risk notes |
| `/test-generation` | Tests with coverage goals and edge cases |
| `/explain-code` | Code explanation at a specified audience level |
| `/pr-description` | PR title, summary, and test plan |
| `/incident-postmortem` | Timeline, root cause, and action items |

Each template walks you through filling in variables step-by-step. If you have text selected in the editor, PromptRev will offer to use it as context automatically.

---

## Keybinding — enhance selected text

Select any text and press `Cmd+Shift+E` (Mac) / `Ctrl+Shift+E` (Windows/Linux) to enhance it without opening chat. Works in `.md` files, scratch pads, code comments — anywhere you draft prompts.

---

## Configuration

```json
{
  "promptrev.domainContext": "React + TypeScript, Node.js, PostgreSQL",
  "promptrev.maxHistory": 100,
  "promptrev.modifiers": {
    "backend": {
      "systemPrompt": "Rewrite for a Node.js + Express + Prisma backend. Include TypeScript, JWT auth, error handling, and input validation.",
      "acceptMode": "diff"
    }
  },
  "promptrev.templates": {
    "my-api-endpoint": {
      "name": "API Endpoint Design",
      "template": "Design a {{method}} endpoint at {{path}} for {{purpose}}.",
      "variables": [
        { "name": "method", "placeholder": "POST", "required": true },
        { "name": "path", "placeholder": "/api/users", "required": true },
        { "name": "purpose", "placeholder": "creating a user", "required": true }
      ]
    }
  }
}
```

| Setting | Default | Description |
|---|---|---|
| `promptrev.domainContext` | `""` | Tech stack injected into every enhancement |
| `promptrev.maxHistory` | `100` | Max history entries kept (1–500) |
| `promptrev.modifiers` | `{}` | Custom or overridden modifier definitions |
| `promptrev.templates` | `{}` | Custom template definitions |

### Team config

Commit a `.promptrev.json` at the repo root to share modifiers and templates across your team:

```json
{
  "domainContext": "React + TypeScript, Node.js, PostgreSQL",
  "modifiers": {
    "backend": {
      "systemPrompt": "Rewrite for our Node.js + Prisma stack.",
      "acceptMode": "diff"
    }
  },
  "templates": {
    "incident-report": {
      "name": "Incident Report",
      "template": "Write a postmortem for {{service}} — duration: {{duration}}, impact: {{impact}}.",
      "variables": [
        { "name": "service", "placeholder": "payments-api", "required": true },
        { "name": "duration", "placeholder": "47 minutes", "required": true },
        { "name": "impact", "placeholder": "checkout unavailable for EU users", "required": true }
      ]
    }
  }
}
```

---

## Requirements

- VS Code `1.85.0` or later
- GitHub Copilot or another VS Code language model extension (recommended)

If no model is available, `:rb` mode still works via rule-based enhancement — no model required.
