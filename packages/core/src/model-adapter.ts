/**
 * Abstract interface over any LLM provider.
 * Both the VS Code extension and CLI implement this interface.
 */
export interface ModelAdapter {
  complete(
    systemPrompt: string,
    userMessage: string,
    signal?: AbortSignal
  ): Promise<string>;
}

/**
 * Rule-based fallback adapter — no LLM call.
 * Used by :fast mode and when no model is available.
 */
export class RuleBasedAdapter implements ModelAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async complete(_systemPrompt: string, userMessage: string, _signal?: AbortSignal): Promise<string> {
    // The rule-based adapter ignores the system prompt and applies
    // deterministic text transformations directly.
    // Actual enhancement logic lives in rule-based.ts and is called by the enhancer.
    return userMessage;
  }
}
