import { z } from 'zod';

export const ModifierKeySchema = z.enum([
  'default',
  'rb',
  'deep',
  'architect',
  'critic',
  'spell',
  'spec',
]);
export type ModifierKey = z.infer<typeof ModifierKeySchema> | string;

export interface ModifierDefinition {
  key: string;
  label: string;
  description: string;
  systemPrompt: string;
  acceptMode: 'diff' | 'auto';
  autoSend: boolean;
  /** false = rule-based only, no LLM call (used by :rb) */
  useLLM: boolean;
}

const DEFAULT_SYSTEM_PROMPT = `You are a prompt engineering assistant. Your job is to rewrite the user's raw prompt to be clearer, more specific, and more likely to produce a high-quality AI response.

Rules:
- Preserve the original intent exactly
- Add missing context (specify language/framework if implied)
- Add output format requirements if missing
- Fix grammar and spelling
- Remove vague filler language
- Do not make the prompt longer than necessary

Return a JSON object with exactly two fields:
- "revised": the rewritten prompt
- "signal": a concise one-line description of what changed (e.g. "Added output format and scope constraints")

Example: {"revised": "...", "signal": "Added output format and domain context"}

Domain context (if provided): {domainContext}`;

const DEEP_SYSTEM_PROMPT = `You are a senior prompt engineer. Rewrite this prompt to elicit an exhaustive, structured, expert-level response from an AI.

Add:
- Step-by-step / chain-of-thought instruction
- Request for edge case coverage
- Request for trade-off analysis where relevant
- Output structure (numbered sections, headers)
- "Think step by step" closing instruction

Return a JSON object: {"revised": "<rewritten prompt>", "signal": "<one-line description of what changed>"}`;

const ARCHITECT_SYSTEM_PROMPT = `You are a software architect and prompt engineer. Rewrite this prompt to elicit a thorough architectural analysis.

Focus on:
- System design perspective (components, interfaces, data flow)
- Trade-off analysis (performance vs. simplicity, consistency vs. availability, etc.)
- Scalability and maintainability considerations
- Decision points that require explicit choices
- Output structure with clear sections

Return a JSON object: {"revised": "<rewritten prompt>", "signal": "<one-line description of what changed>"}`

const CRITIC_SYSTEM_PROMPT = `You are an adversarial reviewer and prompt engineer. Rewrite this prompt to elicit critical, failure-focused analysis.

Reframe the prompt to:
- Request identification of security vulnerabilities, failure modes, and edge cases
- Ask for a steelman of the current approach before critiquing it
- Identify hidden assumptions that could be wrong in production
- Request the top 3 highest-priority improvements
- Emphasize: do not just describe what the code does — focus on what could go wrong

Return a JSON object: {"revised": "<rewritten prompt>", "signal": "<one-line description of what changed>"}`

const SPELL_SYSTEM_PROMPT = `You are a grammar and spelling corrector. Fix only spelling mistakes and grammatical errors in the user's prompt.

Rules:
- Do NOT restructure or rewrite the content
- Do NOT add context, output format requirements, or extra instructions
- Fix only: typos, misspellings, grammar errors, punctuation
- Preserve the user's original words and structure as much as possible

Return a JSON object: {"revised": "<corrected prompt>", "signal": "<one-line description, e.g. 'Fixed 3 spelling errors and punctuation'>"}`;

const SPEC_SYSTEM_PROMPT = `You are a product and engineering spec writer. Convert the user's vague idea into a structured specification prompt.

The rewritten prompt should ask the AI to produce:
- A clear problem statement
- Functional requirements (numbered list)
- Non-functional requirements (performance, security, scalability)
- Acceptance criteria (testable conditions)
- Out-of-scope items
- Open questions

Return a JSON object: {"revised": "<rewritten prompt>", "signal": "<one-line description of what changed>"}`;

export const BUILT_IN_MODIFIERS: Record<string, ModifierDefinition> = {
  default: {
    key: 'default',
    label: 'Default',
    description: 'Grammar, clarity, structure, and missing context injection',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    acceptMode: 'diff',
    autoSend: false,
    useLLM: true,
  },
  rb: {
    key: 'rb',
    label: 'Rule-Based',
    description: 'Rule-based enhancement — no model required, auto-accept',
    systemPrompt: '', // rule-based: no LLM system prompt
    acceptMode: 'auto',
    autoSend: true,
    useLLM: false,
  },
  deep: {
    key: 'deep',
    label: 'Deep',
    description: 'Exhaustive — chain-of-thought, edge cases, structured output',
    systemPrompt: DEEP_SYSTEM_PROMPT,
    acceptMode: 'diff',
    autoSend: false,
    useLLM: true,
  },
  architect: {
    key: 'architect',
    label: 'Architect',
    description: 'System design framing — trade-offs, scalability, components',
    systemPrompt: ARCHITECT_SYSTEM_PROMPT,
    acceptMode: 'diff',
    autoSend: false,
    useLLM: true,
  },
  critic: {
    key: 'critic',
    label: 'Critic',
    description: 'Adversarial review framing — failure modes, assumptions, security',
    systemPrompt: CRITIC_SYSTEM_PROMPT,
    acceptMode: 'diff',
    autoSend: false,
    useLLM: true,
  },
  spell: {
    key: 'spell',
    label: 'Spell',
    description: 'Grammar and spelling only — no structural changes',
    systemPrompt: SPELL_SYSTEM_PROMPT,
    acceptMode: 'diff',
    autoSend: false,
    useLLM: true,
  },
  spec: {
    key: 'spec',
    label: 'Spec',
    description: 'Convert idea to structured spec with acceptance criteria',
    systemPrompt: SPEC_SYSTEM_PROMPT,
    acceptMode: 'diff',
    autoSend: false,
    useLLM: true,
  },
};

/**
 * Resolves a modifier key to its full definition.
 * User-defined modifiers override built-in defaults.
 */
export function resolveModifier(
  key: string,
  userModifiers: Record<string, Partial<ModifierDefinition>> = {}
): ModifierDefinition {
  const builtIn = BUILT_IN_MODIFIERS[key];
  const userDefined = userModifiers[key];

  if (builtIn && userDefined) {
    return { ...builtIn, ...userDefined };
  }

  if (builtIn) {
    return builtIn;
  }

  if (userDefined && userDefined.systemPrompt) {
    return {
      key,
      label: userDefined.label ?? key,
      description: userDefined.description ?? `Custom modifier: ${key}`,
      systemPrompt: userDefined.systemPrompt,
      acceptMode: userDefined.acceptMode ?? 'diff',
      autoSend: userDefined.autoSend ?? false,
      useLLM: userDefined.useLLM ?? true,
    };
  }

  // Unknown modifier key — fall back to default behavior
  return { ...BUILT_IN_MODIFIERS.default, key };
}
