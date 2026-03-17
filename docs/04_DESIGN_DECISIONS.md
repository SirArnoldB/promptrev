# PromptRev — Design Decisions & Open Questions

**Version:** 0.1.0  
**Status:** Design Phase  
**Last Updated:** March 2026

---

## 1. Settled Design Decisions

These are decisions we've made and should not revisit without a strong reason.

---

### DD-01: No MCP Server
**Decision:** PromptRev does not use or require an MCP server.  
**Rationale:** MCP is for giving AI access to external tools/data. Prompt enhancement is a pure text transformation — it needs no external resources, no persistent connection, and no background process. An MCP server would add latency, process overhead, and cognitive load for users who already have many MCP servers enabled.  
**Alternative considered:** MCP prompt tool with `@prompt` trigger. Rejected.

---

### DD-02: `@rev` as Chat Participant (not slash command, not prefix hack)
**Decision:** Use VS Code's official Chat Participant API to register `@rev`.  
**Rationale:** This gives native autocomplete, proper routing, clean text interception, and first-class VS Code citizenship. It's the right API for this use case.  
**Alternative considered:** Detecting `@rev` as plain text in the input. Rejected — fragile, not native.

---

### DD-03: Use `vscode.lm` as the primary model in the extension
**Decision:** The VS Code extension uses `vscode.lm` (the Language Model API) to route through whatever model the user already has active, with no separate API key required.  
**Rationale:** Zero setup friction. The user already paid for their model. Enhancement quality improves automatically as their model improves.  
**Fallback:** User-configured API key → rule-based (`:rb` only).

---

### DD-04: `:rb` mode is rule-based with no LLM call
**Decision:** The `:rb` modifier uses local rule-based text processing — no API call.  
**Rationale:** If someone uses `:rb`, they're signaling they want zero friction and near-zero latency. Making an LLM call defeats the purpose. The rules (remove filler, fix obvious grammar, ensure punctuation) are sufficient for the fast-path use case.  
**Note:** Users can override this in config if they want LLM quality for `:rb`.

---

### DD-05: Spelling correction is baked in, not a separate pass
**Decision:** Every enhancement pass automatically fixes spelling/grammar. `:spell` is a modifier for "spelling/grammar only, no restructuring" — not the only way to get spell checking.  
**Rationale:** LLMs fix typos naturally during rewriting. Making it a separate step would be slower and redundant.

---

### DD-06: Monorepo with `core` as a shared package
**Decision:** Business logic lives in `@promptrev/core`, which has zero VS Code or CLI dependencies. Both `vscode` and `cli` depend on `core`.  
**Rationale:** Prevents duplication, ensures consistent enhancement behavior across both surfaces, makes testing easier (test `core` without spinning up VS Code).

---

### DD-07: No custom UI injection into Copilot Chat input
**Decision:** PromptRev does not attempt to inject buttons or UI into the Copilot Chat input box.  
**Rationale:** VS Code does not expose a public API for this. Any injection would rely on unstable DOM hacks that would break with every VS Code update.  
**Compensating design:** The `@rev` participant + keybinding provides equivalent access points without any injection.

---

### DD-08: Diff shown in chat as markdown, not a separate panel
**Decision:** The diff preview between original and revised prompt is shown directly in the chat response as formatted markdown with action buttons.  
**Rationale:** This is the natural VS Code Chat Participant response format. It requires no custom webview for the primary flow, and keeps the user in context.  
**Exception:** History panel is a WebviewView in the sidebar (separate from the chat diff).

---

### DD-09: History stored in `vscode.ExtensionContext.globalState`
**Decision:** Prompt history is stored in VS Code's built-in `globalState` (persists across sessions, scoped to the extension).  
**Rationale:** No extra dependencies, no file system management, survives restarts, automatically cleared with extension uninstall.  
**Limit:** 100 entries by default, configurable.

---

## 2. Open Questions

These require answers before or during the build phase.

---

### OQ-01: What happens when `autoSend: true` after acceptance?
**Question:** When the user accepts an enhanced prompt and `autoSend` is `true`, how do we programmatically "send" the message to the AI? Does the VS Code Chat Participant API support triggering a follow-up message?  
**Options:**
- A: Return the enhanced prompt as a follow-up message from the participant itself (streams the enhanced prompt and passes it to the AI inline)
- B: Write the enhanced prompt to the chat input and programmatically submit (may not be possible without private APIs)
- C: `autoSend` is only possible when PromptRev itself is the chat surface (i.e. forward to the AI via a second `vscode.lm` call)

**Recommended investigation:** Test what the Chat Participant API allows in terms of follow-up message injection.  
**Risk level:** Medium — may affect the `autoSend` feature design significantly.

---

### OQ-02: How do we handle the `@rev` participant receiving a very long prompt?
**Question:** If a user pastes a 2,000 token prompt into `@rev`, do we still send the entire thing to the polishing LLM?  
**Options:**
- Truncate at a configurable token limit (default: 500 tokens) and warn
- Always send full prompt but warn about latency
- Use a sliding window (enhance the first N tokens, leave the rest)

**Decision needed before:** Building `enhancer.ts`.

---

### OQ-03: `vscode.lm` vendor targeting
**Question:** `vscode.lm.selectChatModels` accepts a `vendor` filter. Should we default to `copilot`, or try to enumerate all available models?  
**Consideration:** If the user has Claude via some other extension, targeting only `copilot` would miss it.  
**Proposed approach:** Try `copilot` first, then fall back to `selectChatModels({})` (all vendors), then API key fallback.

---

### OQ-04: Modifier discovery for custom modifiers
**Question:** If a user defines custom modifiers in `.promptrev.json`, should `@rev:[customkey]` work with autocomplete?  
**Challenge:** VS Code Chat Participant commands are declared statically in `package.json` — they can't be dynamically registered from a project config file at runtime.  
**Options:**
- Static built-ins only autocomplete; custom modifiers are typed manually but still work
- Use a `@rev:custom` command that prompts the user to pick from their defined modifiers
- Document that custom modifiers work but don't autocomplete (acceptable for v1)

---

### OQ-05: Multi-language support
**Question:** Should PromptRev enhance prompts written in languages other than English?  
**Consideration:** Many global developers write prompts in their native language. The LLM can handle this, but the modifier system prompts are currently English-only.  
**Proposed approach for v1:** Detect prompt language, pass it to the LLM, instruct it to preserve the input language in the output. Add explicit i18n to modifier system prompts in v2.

---

### OQ-06: `.promptrev.json` project config resolution
**Question:** When the user has both `settings.json` global config and a `.promptrev.json` in the workspace root, how are they merged?  
**Proposed merge strategy:**
- `.promptrev.json` (project) **overrides** `settings.json` (global) for the same keys
- Custom modifiers are **merged** (project modifiers + global modifiers, project wins on key conflict)
- `domainContext` from `.promptrev.json` **prepends** to `settings.json` domain context

---

## 3. Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `vscode.lm` API changes between VS Code versions | Medium | High | Pin minimum engine version, test on multiple VS Code versions in CI |
| Chat Participant API doesn't allow autoSend | Medium | Medium | Redesign autoSend as "copy to clipboard + open chat" fallback |
| Enhancement latency spikes under slow models | Low | Medium | Always stream; add timeout (5s) with rule-based fallback |
| pnpm workspace path issues on Windows | Low | Low | Test on Windows in CI from day one |
| `vsce` VSIX packaging breaks with pnpm workspaces | Low | Medium | Use `webpack` or `esbuild` to fully bundle before packaging |

---

## 4. v1.0 Scope Boundary

The following are explicitly **out of scope for v1.0** to keep the build focused:

- Custom UI panel / input box
- JetBrains or Neovim support
- Team analytics or prompt rating system
- Voice input integration
- GitHub PR comment integration
- Cloud sync of history or modifier libraries
- AI-powered modifier *suggestion* (suggesting which modifier to use)
- Diff highlighting in the actual VS Code editor (complex webview)

---

## 5. Naming & Branding

**Package name:** `promptrev`  
**VS Code participant:** `@rev`  
**VS Code extension ID:** `promptrev.promptrev`  
**npm package:** `promptrev`  
**CLI binary:** `rev`  
**GitHub repo:** `promptrev/promptrev` (suggested)

**Publisher ID:** To be created on VS Code Marketplace. Confirm `promptrev` is available as publisher name.

---

## 6. Versioning Strategy

| Version | Milestone |
|---|---|
| `0.1.0` | Core package + basic `@rev` participant (default modifier only) |
| `0.2.0` | Full modifier system (all built-in modifiers) |
| `0.3.0` | Keybinding + inline diff flow |
| `0.4.0` | History panel |
| `0.5.0` | CLI / npm package |
| `0.6.0` | Custom user-defined modifiers |
| `1.0.0` | Stable, published to Marketplace + npm |
