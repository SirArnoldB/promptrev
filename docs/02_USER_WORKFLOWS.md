# PromptRev — User Workflows & Scenarios

**Version:** 0.1.0  
**Status:** Design Phase  
**Last Updated:** March 2026

---

## 1. Overview

This document describes real-world user workflows and scenarios for PromptRev. Each scenario includes the trigger, the step-by-step experience, and notes on configuration or behavior nuances.

---

## 2. Primary Workflows

---

### Workflow 1 — Default Enhancement via `@rev`

**Persona:** Any developer using VS Code with Copilot Chat or Claude  
**Trigger:** User types `@rev` followed by their raw prompt in chat  
**Goal:** Get a polished, clearer version of their prompt before sending to the AI

**Steps:**

```
1. User opens Copilot Chat / Claude chat in VS Code sidebar
2. User types: @rev fix the bug in my auth module
3. PromptRev intercepts the message (Chat Participant API)
4. Enhancement runs (~400ms using vscode.lm)
5. Diff preview appears in chat:

   ─────────────────────────────────────────────
   ORIGINAL:  fix the bug in my auth module
   
   REVISED:   Identify and fix the bug in the authentication
              module. The module handles [JWT / session] tokens.
              Focus on: token validation logic, error handling
              for expired/invalid tokens, and ensure the fix
              does not break existing auth flows. Provide a
              brief explanation of what caused the bug.
   ─────────────────────────────────────────────
   [✓ Accept & Send]   [✎ Edit First]   [✗ Dismiss]

6. User clicks "Accept & Send"
7. The polished prompt is sent to the AI as if the user typed it
```

**Notes:**
- The `@rev` prefix is stripped — the AI never sees it
- The domain context ("JWT / session tokens") is injected from `promptrev.domainContext` in settings
- If `autoSend: true`, step 5-6 collapses — polished prompt goes straight to AI

---

### Workflow 2 — Keybinding on Selected Text

**Persona:** Power user who doesn't want to retype in the chat  
**Trigger:** User selects text anywhere (editor, terminal, notes), hits `Cmd+Shift+E`  
**Goal:** Polish a draft prompt written in the editor before copying it to chat

**Steps:**

```
1. User drafts a rough prompt in any editor file:
   "make the api faster idk maybe caching or something"

2. User selects the text
3. User presses Cmd+Shift+E (or Ctrl+Shift+E on Windows)

4. A small floating diff popup appears inline:

   ─────────────────────────────────────────────
   ORIGINAL:  make the api faster idk maybe caching or something
   
   REVISED:   Optimize the API response time. Evaluate and
              implement a caching strategy (e.g., Redis or
              in-memory cache) for high-frequency endpoints.
              Identify the current bottlenecks, suggest the
              most appropriate caching layer, and provide
              implementation steps with expected performance
              impact.
   ─────────────────────────────────────────────
   [✓ Replace]   [✎ Edit]   [✗ Cancel]

5. User clicks "Replace" — selected text is updated in place
6. User copies the polished text and pastes into chat
```

**Notes:**
- Works in any text context — `.md` files, `scratch.txt`, even the VS Code terminal input
- "Replace" updates the selection in the editor; it does not send anything to the AI automatically

---

### Workflow 3 — Deep Mode for Architecture Thinking

**Persona:** Senior developer or architect planning a system  
**Trigger:** `@rev:deep` modifier  
**Goal:** Transform a high-level idea into a structured, exhaustive prompt that produces thorough architectural output

**Steps:**

```
1. User types: @rev:deep design a notification system for my app

2. Enhancement runs with the :deep system prompt:
   - Adds chain-of-thought instruction
   - Prompts the AI to consider scale, edge cases, trade-offs
   - Adds output structure requirements

3. Diff preview:

   REVISED:   Design a scalable notification system for the
              application. Cover the following:
              
              1. Delivery channels (email, push, in-app, SMS)
                 and when each should be used
              2. Data model for notifications and user preferences
              3. Queue/async architecture (consider high-volume bursts)
              4. Retry logic and failure handling
              5. Read/unread state management
              6. Trade-offs between polling vs WebSockets vs SSE
              7. Third-party services vs self-hosted considerations
              
              Think step by step. Call out assumptions. Flag any
              decision points that require product input.

4. User reviews, optionally edits, accepts
```

**Notes:**
- `:deep` always defaults to `acceptMode: "diff"` — the output changes significantly and the user should review
- Enhancement latency for `:deep` may be 600–900ms (more tokens in system prompt)

---

### Workflow 4 — Fast Mode for Quick Fixes

**Persona:** Developer in flow state, wants zero friction  
**Trigger:** `@rev /rb` modifier  
**Goal:** Sharpen a prompt instantly with no review step, send immediately

**Steps:**

```
1. User types: @rev /rb fix null check on user.profile

2. PromptRev runs rule-based cleanup (no LLM call in rb mode):
   - Fix grammar/spelling
   - Remove filler words
   - Add minimal structure

3. Result (no diff shown — auto-accept):
   "Add a null guard before accessing user.profile to prevent
   runtime errors. Apply the fix where user.profile is first
   accessed."

4. Polished prompt is sent directly to AI (autoSend: true for :rb)
```

**Notes:**
- `:rb` uses rule-based processing by default — truly zero latency, no API call
- `autoSend` is `true` by default for `:rb` — the whole point is zero friction
- User can override to use LLM for `:rb` in settings if they want higher quality

---

### Workflow 5 — Spell Check Only

**Persona:** Non-native English speaker, or anyone who wants correction without restructuring  
**Trigger:** `@rev:spell` modifier  
**Goal:** Fix typos and grammar without changing the content or structure of the prompt

**Steps:**

```
1. User types: @rev:spell does this endpoint handel concurrent request proprly

2. LLM corrects only spelling and grammar:

   REVISED:   Does this endpoint handle concurrent requests properly?

3. Diff shows a minimal change — only typos fixed, no restructuring
4. User accepts
```

**Notes:**
- `:spell` is the most conservative modifier — it changes as little as possible
- Useful for non-native English speakers who have already crafted the right prompt but want surface-level cleanup
- Also good for voice-to-text workflows where transcripts have phonetic errors

---

### Workflow 6 — Critic Mode for Code Review Prompts

**Persona:** Developer preparing a prompt for a code review or security audit task  
**Trigger:** `@rev:critic` modifier  
**Goal:** Reframe the prompt to produce adversarial, critical AI output

**Steps:**

```
1. User types: @rev:critic review my authentication implementation

2. Enhancement reframes with :critic system prompt:

   REVISED:   Critically review the authentication implementation.
              Act as a security-focused adversarial reviewer:
              
              - Identify security vulnerabilities (injection,
                token leakage, session fixation, etc.)
              - Steelman the current approach, then identify
                where it fails
              - Flag any assumptions the implementation makes
                that could be wrong in production
              - Suggest the top 3 highest-priority fixes
              
              Do not just describe what the code does — focus
              on what could go wrong.

3. User accepts, sends to AI for a much more rigorous review
```

---

### Workflow 7 — Custom Modifier (Team-Defined)

**Persona:** Team lead who has defined project-specific enhancement rules  
**Trigger:** `@rev:backend` (custom modifier defined in `.promptrev.json`)  
**Goal:** Auto-inject team-specific context into every prompt

**`.promptrev.json` (committed to repo):**
```json
{
  "modifiers": {
    "backend": {
      "systemPrompt": "Rewrite this prompt for a Node.js + Express backend developer working on a multi-tenant SaaS API. Always include: language (TypeScript), database (PostgreSQL + Prisma), auth method (JWT), and request that output includes error handling and input validation.",
      "acceptMode": "diff"
    }
  }
}
```

**Steps:**
```
1. Developer types: @rev:backend add a new endpoint for user invites

2. Enhanced prompt:
   "Create a new TypeScript/Express endpoint for sending user
   invitations in a multi-tenant SaaS context. Use Prisma for
   database operations (PostgreSQL). Include:
   - JWT authentication middleware
   - Input validation (email format, tenant scoping)
   - Error handling (duplicate invite, invalid email, rate limiting)
   - Return appropriate HTTP status codes
   - Brief inline comments explaining key decisions."

3. Every developer on the team gets the same quality baseline
   without needing to know prompt engineering
```

---

### Workflow 8 — CLI Usage

**Persona:** Developer working in the terminal, using AI CLI tools  
**Trigger:** `rev` CLI command  
**Goal:** Polish a prompt before piping it to an AI CLI tool

**Steps:**

```bash
# Direct enhancement
rev "fix the race condition in my queue worker"

# Output:
# Identify and fix the race condition in the queue worker.
# Focus on: concurrent job pickup, lock mechanisms, and
# ensuring idempotency. Explain the root cause and the fix.

# With modifier
rev --mod deep "design a job queue"

# Pipe to another tool
rev "summarize this file" | some-ai-cli-tool

# Read from file
rev --file prompt_draft.txt --mod architect
```

**Notes:**
- CLI reads API key from environment variable: `PROMPTREV_API_KEY` or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`
- Modifier flag: `--mod` or `-m`
- Output is plain text by default; `--json` flag for structured output

---

## 3. Edge Case Scenarios

### Scenario A — No Model Available

```
User invokes @rev but has no Copilot subscription and no API key configured.

Behavior:
- PromptRev falls back to rule-based enhancement for :rb
- For other modifiers, shows a notification:
  "PromptRev: No language model available. Configure an API key
  in settings or activate GitHub Copilot. [Open Settings]"
- Original prompt is preserved unchanged
```

---

### Scenario B — Very Short Prompt

```
User types: @rev help

Behavior:
- PromptRev returns the prompt unchanged with a soft notice:
  "Prompt is too short to enhance meaningfully. Add more
  context about what you need help with."
- No diff shown, no API call made
```

---

### Scenario C — Prompt Already Well-Structured

```
User types a prompt that is already detailed and well-formed.

Behavior:
- PromptRev returns it with minimal changes (maybe light grammar)
- Diff shows "No significant changes needed"
- User accepts or dismisses — no wasted processing
```

---

### Scenario D — User Edits the Enhanced Prompt

```
User invokes @rev:deep, sees the enhanced version, but wants to
adjust part of it before sending.

Behavior:
- User clicks "Edit First"
- Enhanced prompt drops into the chat input as editable text
- User modifies freely, then sends manually
- History records: original → enhanced → user-edited (all three states)
```

---

### Scenario E — Cancel Mid-Enhancement

```
User invokes @rev, changes their mind immediately.

Behavior:
- Escape key or "Dismiss" cancels the pending LLM call
- Original prompt is restored exactly
- No history entry created (cancelled before completion)
```

---

## 4. Modifier Quick Reference

| Modifier | Best For | Auto-send | Latency |
|---|---|---|---|
| `@rev` (default) | General everyday prompts | Off | ~400ms |
| `@rev /rb` | Quick fixes, high-velocity flow | On | ~0ms (rule-based) |
| `@rev:deep` | Architecture, complex tasks | Off | ~700ms |
| `@rev:architect` | System design, trade-off analysis | Off | ~600ms |
| `@rev:critic` | Code review, security audits | Off | ~500ms |
| `@rev:spell` | Grammar/spelling only | Off | ~300ms |
| `@rev:spec` | Converting ideas to acceptance criteria | Off | ~600ms |
| `@rev:[custom]` | Team/project-specific rules | Configurable | Configurable |

---

## 5. History Panel Workflow

```
User opens PromptRev History panel in VS Code sidebar.

Panel shows:
┌─────────────────────────────────┐
│ PROMPTREV HISTORY               │
│                                 │
│ ▼ 2 min ago  [@rev:deep]        │
│   Original:  "design a cache"   │
│   Revised:   "Design a distrib  │
│              uted caching lay…" │
│   [↩ Restore Original]          │
│                                 │
│ ▼ 8 min ago  [@rev /rb]         │
│   Original:  "fix null check"   │
│   Revised:   "Add null guard…"  │
│   [↩ Restore Original]          │
│                                 │
│ [Export JSON]  [Clear History]  │
└─────────────────────────────────┘

Actions:
- "Restore Original" puts the original prompt back into the chat input
- "Export JSON" downloads full history as promptrev-history.json
- "Clear History" with confirmation dialog
```
