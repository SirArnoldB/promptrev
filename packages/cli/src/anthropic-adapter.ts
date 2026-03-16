import Anthropic from '@anthropic-ai/sdk';
import type { ModelAdapter } from '@promptrev/core';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Resolves the API key from environment variables in priority order:
 * PROMPTREV_API_KEY → ANTHROPIC_API_KEY → OPENAI_API_KEY (future)
 */
function resolveApiKey(): string | undefined {
  return (
    process.env.PROMPTREV_API_KEY ??
    process.env.ANTHROPIC_API_KEY ??
    undefined
  );
}

/**
 * Resolves the model to use from env or falls back to default.
 */
function resolveModel(flagModel?: string): string {
  return flagModel ?? process.env.PROMPTREV_MODEL ?? DEFAULT_MODEL;
}

export class AnthropicModelAdapter implements ModelAdapter {
  private client: Anthropic;
  private model: string;

  constructor(options: { model?: string; apiKey?: string } = {}) {
    const apiKey = options.apiKey ?? resolveApiKey();

    if (!apiKey) {
      throw new Error(
        'No API key found. Set PROMPTREV_API_KEY or ANTHROPIC_API_KEY environment variable.\n' +
          'Get a key at: https://console.anthropic.com/settings/keys'
      );
    }

    this.client = new Anthropic({ apiKey });
    this.model = resolveModel(options.model);
  }

  async complete(systemPrompt: string, userMessage: string, signal?: AbortSignal): Promise<string> {
    try {
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        },
        { signal }
      );

      const block = response.content[0];
      if (block.type !== 'text') {
        throw new Error('Unexpected response type from Anthropic API');
      }
      return block.text;
    } catch (err) {
      if (err instanceof Error) {
        // Re-throw AbortError for cancellation propagation
        if (err.name === 'AbortError') throw err;

        // Translate Anthropic SDK errors into actionable messages
        if (err.message.includes('401') || err.message.includes('authentication')) {
          throw new Error('Invalid API key. Check your PROMPTREV_API_KEY or ANTHROPIC_API_KEY.');
        }
        if (err.message.includes('429') || err.message.includes('rate_limit')) {
          throw new Error('Rate limit reached. Wait a moment and try again.');
        }
        if (err.message.includes('529') || err.message.includes('overloaded')) {
          throw new Error('Anthropic API is temporarily overloaded. Try again shortly.');
        }
      }
      throw err;
    }
  }
}

export { resolveApiKey, resolveModel };
