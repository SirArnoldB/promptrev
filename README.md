# PromptRev

> Instantly enhance your AI prompts with `@rev` — VS Code extension, CLI, and SDK.

PromptRev is a developer tool that automatically enhances, polishes, and refines prompts before they are sent to an AI agent. It works as a VS Code extension, a CLI npm package, and a standalone SDK.

## Features

- **`@rev` Chat Participant** — type `@rev your prompt` in VS Code Chat for instant enhancement
- **Global keybinding** — `Cmd+Shift+E` / `Ctrl+Shift+E` to enhance selected text
- **Modifier system** — `:fast`, `:deep`, `:architect`, `:critic`, `:spell`, `:spec`
- **No extra API key needed** — reuses your existing Copilot/Claude model via `vscode.lm`
- **Prompt history panel** — review, restore, and export past enhancements

## Monorepo Structure

```
promptrev/
├── packages/
│   ├── core/     ← Shared enhancement engine (@promptrev/core)
│   ├── vscode/   ← VS Code/Visual Studio extension
│   └── cli/      ← npm SDK + CLI binary (promptrev)
├── docs/         ← PRD, technical spec, design decisions
└── ...
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Build core package
pnpm build:core

# Run all tests
pnpm test
```

## Usage (VS Code)

```
@rev fix the bug in my auth module
@rev:fast fix null check
@rev:deep design a notification system
@rev:architect design a job queue
@rev:critic review my auth implementation
@rev:spell does this endpoint handel concurrent request proprly
@rev:spec add user invite feature
```

## Usage (CLI)

```bash
npx promptrev "fix the race condition in my queue worker"
rev --mod deep "design a job queue system"
echo "fix null check" | rev --mod fast
```

## Packages

| Package | Description |
|---|---|
| `@promptrev/core` | Enhancement engine — no VS Code or Node I/O dependencies |
| `@promptrev/vscode` | VS Code extension (published to Marketplace) |
| `promptrev` | CLI tool and SDK (published to npm) |

## License

MIT
