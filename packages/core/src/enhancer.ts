import { ModelAdapter } from './model-adapter';
import { ModifierKey, resolveModifier, ModifierDefinition } from './modifiers';
import { computeDiff, DiffChunk } from './diff';
import { ruleBasedEnhance } from './rule-based';

export interface EnhancerInput {
  rawPrompt: string;
  modifier: ModifierKey;
  /** e.g. "React + TypeScript, Node.js backend, PostgreSQL" */
  domainContext?: string;
  modelAdapter: ModelAdapter;
  userModifiers?: Record<string, Partial<ModifierDefinition>>;
  signal?: AbortSignal;
}

export interface EnhancerOutput {
  original: string;
  revised: string;
  modifier: ModifierKey;
  timestamp: number;
  /** true if the prompt was too short or already well-formed — no changes made */
  skipped: boolean;
  diff: DiffChunk[];
}

const MIN_PROMPT_LENGTH = 5;

/**
 * Interpolates {domainContext} placeholder in a system prompt.
 */
function interpolateSystemPrompt(systemPrompt: string, domainContext?: string): string {
  if (!domainContext) {
    return systemPrompt.replace(/\nDomain context \(if provided\): \{domainContext\}/g, '');
  }
  return systemPrompt.replace('{domainContext}', domainContext);
}

/**
 * Main enhancement entry point.
 * Takes a raw prompt and returns an enhanced version using the specified modifier.
 */
export async function enhance(input: EnhancerInput): Promise<EnhancerOutput> {
  const { rawPrompt, modifier, domainContext, modelAdapter, userModifiers, signal } = input;
  const timestamp = Date.now();

  // Skip enhancement for very short prompts
  if (rawPrompt.trim().length < MIN_PROMPT_LENGTH) {
    return {
      original: rawPrompt,
      revised: rawPrompt,
      modifier,
      timestamp,
      skipped: true,
      diff: [],
    };
  }

  const modifierDef = resolveModifier(modifier as string, userModifiers);

  let revised: string;

  if (!modifierDef.useLLM) {
    // :fast mode — rule-based only, no LLM call
    revised = ruleBasedEnhance(rawPrompt);
  } else {
    const systemPrompt = interpolateSystemPrompt(modifierDef.systemPrompt, domainContext);

    try {
      revised = await modelAdapter.complete(systemPrompt, rawPrompt, signal);
      revised = revised.trim();
    } catch (err) {
      // If LLM call fails, fall back to rule-based
      if (err instanceof Error && err.name === 'AbortError') {
        throw err; // propagate cancellations
      }
      // Soft fallback for other errors
      revised = ruleBasedEnhance(rawPrompt);
    }
  }

  // If the LLM returned nothing meaningful, keep original
  if (!revised || revised.length < 2) {
    revised = rawPrompt;
  }

  const skipped = revised.trim() === rawPrompt.trim();
  const diff = skipped ? [] : computeDiff(rawPrompt, revised);

  return {
    original: rawPrompt,
    revised,
    modifier,
    timestamp,
    skipped,
    diff,
  };
}
