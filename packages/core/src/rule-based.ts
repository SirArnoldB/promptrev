/**
 * Rule-based prompt enhancement for :fast mode.
 * No LLM call — deterministic, zero latency.
 */

const FILLER_PHRASES = [
  /\bidk\b/gi,
  /\bor something\b/gi,
  /\bmaybe\b/gi,
  /\bkinda\b/gi,
  /\bsorta\b/gi,
  /\blike,?\s/gi,
  /\bbasically\b/gi,
  /\bjust\b/gi,
  /\bpretty much\b/gi,
  /\bI guess\b/gi,
  /\bI think\b/gi,
  /\bum\b/gi,
  /\buh\b/gi,
];

const COMMON_DEV_CORRECTIONS: Record<string, string> = {
  'recieve': 'receive',
  'occured': 'occurred',
  'seperate': 'separate',
  'definately': 'definitely',
  'existance': 'existence',
  'untill': 'until',
  'writting': 'writing',
  'runing': 'running',
  'handelr': 'handler',
  'handelrs': 'handlers',
  'respnse': 'response',
  'respose': 'response',
  'reponse': 'response',
  'databse': 'database',
  'datbase': 'database',
  'funciton': 'function',
  'fucntion': 'function',
  'retrun': 'return',
  'improt': 'import',
  'exprot': 'export',
  'asyncronous': 'asynchronous',
  'syncronous': 'synchronous',
  'athentication': 'authentication',
  'authetication': 'authentication',
  'authorizaton': 'authorization',
};

/**
 * Fix common developer typos using a lookup table.
 */
function fixCommonTypos(text: string): string {
  let result = text;
  for (const [typo, correction] of Object.entries(COMMON_DEV_CORRECTIONS)) {
    const regex = new RegExp(`\\b${typo}\\b`, 'gi');
    result = result.replace(regex, (match) => {
      // Preserve original casing
      if (match[0] === match[0].toUpperCase()) {
        return correction.charAt(0).toUpperCase() + correction.slice(1);
      }
      return correction;
    });
  }
  return result;
}

/**
 * Remove filler phrases that weaken a prompt.
 */
function removeFiller(text: string): string {
  let result = text;
  for (const pattern of FILLER_PHRASES) {
    result = result.replace(pattern, '');
  }
  // Clean up double spaces left by removals
  return result.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Ensure the prompt ends with punctuation.
 */
function ensureEndPunctuation(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return trimmed + '.';
}

/**
 * Capitalize the first letter of the prompt.
 */
function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * If the prompt has no verb indicator, prepend "Please".
 * Simple heuristic: check if the prompt starts with a noun-like word.
 */
function ensureImperative(text: string): string {
  const startsWithVerb = /^(fix|add|create|update|remove|delete|implement|refactor|optimize|check|review|explain|describe|list|find|show|write|build|make|get|set|run|test|debug|analyze|help)/i.test(
    text.trim()
  );
  if (!startsWithVerb) {
    return `Please ${text.trim()}`;
  }
  return text;
}

/**
 * Apply all rule-based enhancements in sequence.
 * Used by :fast mode — no LLM call required.
 */
export function ruleBasedEnhance(raw: string): string {
  let result = raw.trim();

  result = fixCommonTypos(result);
  result = removeFiller(result);
  result = ensureImperative(result);
  result = capitalizeFirst(result);
  result = ensureEndPunctuation(result);

  return result;
}
