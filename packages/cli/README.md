# promptrev

> Enhance your AI prompts from the terminal — before you send them.

PromptRev rewrites your rough prompts into clear, specific, high-quality AI prompts. Pipe it into any CLI tool or use it as an SDK in your own code.

## Install

```bash
npm install -g promptrev
# or
npx promptrev "my prompt"
```

## Usage

```bash
# Basic enhancement (requires ANTHROPIC_API_KEY)
rev "fix the auth bug in my app"

# Rule-based fast mode — no API key needed
rev --mod fast "explain this code"

# Pipe into any tool
rev "design a rate limiter" | claude
echo "fix the bug" | rev --mod deep | codex

# Read from file
rev --file prompt.txt --mod architect

# Output full JSON result
rev --json "my prompt"

# List all modifiers
rev --list-modifiers
```

## API key

Set one of the following environment variables:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or
export PROMPTREV_API_KEY=sk-ant-...
```

Get a key at [console.anthropic.com](https://console.anthropic.com/settings/keys).

## Modifiers

| Modifier | Description |
|---|---|
| `default` | Grammar, clarity, structure, and missing context |
| `fast` | Rule-based sharpen — zero latency, no API key |
| `deep` | Chain-of-thought, edge cases, structured output |
| `architect` | System design framing — trade-offs, scalability |
| `critic` | Adversarial review — failure modes, assumptions |
| `spell` | Grammar and spelling only |
| `spec` | Convert idea to structured spec with acceptance criteria |

## SDK usage

```typescript
import { enhance, AnthropicModelAdapter } from 'promptrev';

const adapter = new AnthropicModelAdapter(); // reads ANTHROPIC_API_KEY
const result = await enhance({
  rawPrompt: 'fix the auth bug',
  modifier: 'deep',
  modelAdapter: adapter,
});

console.log(result.revised); // enhanced prompt
console.log(result.signal);  // e.g. "Added chain-of-thought and edge case coverage"
```

## VS Code extension

For the full experience with diff preview, history panel, and `@rev` chat participant, install the [PromptRev VS Code extension](https://marketplace.visualstudio.com/items?itemName=promptrev.promptrev).

## License

MIT
