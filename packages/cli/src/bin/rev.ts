import { Command } from 'commander';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { enhance, RuleBasedAdapter, BUILT_IN_MODIFIERS } from '@promptrev/core';
import { AnthropicModelAdapter, resolveApiKey } from '../anthropic-adapter.js';

const program = new Command();

program
  .name('rev')
  .description('Enhance your AI prompts before sending them')
  .version('0.1.0')
  .argument('[prompt]', 'Prompt text to enhance (or pipe via stdin)')
  .option('-m, --mod <modifier>', 'Modifier to apply (default, rb, deep, architect, critic, spell, spec)', 'default')
  .option('-f, --file <path>', 'Read prompt from a file')
  .option('--json', 'Output full result as JSON')
  .option('--model <model>', 'Override the model (e.g. claude-opus-4-6)')
  .option('--list-modifiers', 'List all available modifiers and exit')
  .action(async (promptArg: string | undefined, options) => {
    // --list-modifiers: print table and exit
    if (options.listModifiers) {
      printModifiers();
      process.exit(0);
    }

    // Resolve prompt: argument → --file → stdin
    const rawPrompt = await resolvePrompt(promptArg, options.file);

    if (!rawPrompt) {
      console.error('Error: No prompt provided. Pass a prompt argument, --file, or pipe via stdin.');
      process.exit(1);
    }

    const modifier = options.mod as string;
    const isFast = modifier === 'rb';

    // :rb uses rule-based adapter — no API key required
    let adapter;
    if (isFast) {
      adapter = new RuleBasedAdapter();
    } else {
      const apiKey = resolveApiKey();
      if (!apiKey) {
        console.error(
          'Error: No API key found.\n' +
            'Set PROMPTREV_API_KEY or ANTHROPIC_API_KEY environment variable.\n' +
            'Or use --mod rb for rule-based enhancement with no API key.'
        );
        process.exit(1);
      }
      try {
        adapter = new AnthropicModelAdapter({ model: options.model });
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    }

    try {
      const result = await enhance({
        rawPrompt,
        modifier,
        modelAdapter: adapter,
      });

      if (result.skipped) {
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.original);
        }
        return;
      }

      if (options.json) {
        // Omit diff chunks from JSON output (not useful in terminal)
        const { diff: _diff, ...rest } = result;
        console.log(JSON.stringify(rest, null, 2));
      } else {
        if (result.signal) {
          console.error(`✨ ${result.signal}`); // stderr so it doesn't pollute pipe output
        }
        console.log(result.revised);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program.parse();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resolvePrompt(arg?: string, filePath?: string): Promise<string> {
  if (arg) return arg.trim();

  if (filePath) {
    const normalizedPath = resolve(filePath);
    try {
      return readFileSync(normalizedPath, 'utf8').trim();
    } catch {
      console.error(`Error: Could not read file: ${normalizedPath}`);
      process.exit(1);
    }
  }

  // stdin (pipe)
  if (!process.stdin.isTTY) {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      process.stdin.on('data', (chunk) => chunks.push(chunk));
      process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8').trim()));
    });
  }

  return '';
}

function printModifiers(): void {
  const col1 = 12;
  const col2 = 12;
  console.log(`${'Modifier'.padEnd(col1)}${'Accept mode'.padEnd(col2)}Description`);
  console.log('─'.repeat(72));
  for (const [key, def] of Object.entries(BUILT_IN_MODIFIERS)) {
    const mode = def.useLLM ? def.acceptMode : 'auto (rule-based)';
    console.log(`${key.padEnd(col1)}${mode.padEnd(col2)}${def.description}`);
  }
}
