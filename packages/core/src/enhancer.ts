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
  /** One-line description of what the enhancement changed, e.g. "Added output format and constraints" */
  signal?: string;
}

const MIN_PROMPT_LENGTH = 5;

/**
 * Parses LLM response — expects JSON { revised, signal } but falls back
 * gracefully to plain text if the model doesn't follow the format.
 */
function parseEnhancerResponse(raw: string): { revised: string; signal?: string } {
  const trimmed = raw.trim();
  // Strip optional ```json ... ``` fence the LLM sometimes adds
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(candidate);
    if (typeof parsed?.revised === 'string') {
      return {
        revised: parsed.revised.trim(),
        signal: typeof parsed.signal === 'string' ? parsed.signal.trim() || undefined : undefined,
      };
    }
  } catch {
    // Not JSON — treat entire response as revised text, no signal
  }
  return { revised: trimmed };
}

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
  let qualitySignal: string | undefined;

  if (!modifierDef.useLLM) {
    // :rb mode — rule-based only, no LLM call
    revised = ruleBasedEnhance(rawPrompt);
  } else {
    const systemPrompt = interpolateSystemPrompt(modifierDef.systemPrompt, domainContext);

    try {
      const raw = await modelAdapter.complete(systemPrompt, rawPrompt, signal);
      ({ revised, signal: qualitySignal } = parseEnhancerResponse(raw));
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
    signal: qualitySignal,
  };
}
