export interface TemplateVariable {
  name: string;
  description: string;
  placeholder: string;
  required: boolean;
}

export interface PromptTemplate {
  key: string;
  name: string;
  description: string;
  tags: string[];
  /** Raw string with {{variable}} placeholders */
  template: string;
  variables: TemplateVariable[];
  /** Suggested modifier key, e.g. 'critic' for code-review */
  suggestedModifier?: string;
}

export class TemplateVariableError extends Error {
  constructor(
    public readonly templateKey: string,
    public readonly missingVariables: string[]
  ) {
    super(
      `Template "${templateKey}" is missing required variables: ${missingVariables.join(', ')}`
    );
    this.name = 'TemplateVariableError';
  }
}

// ─── Built-in templates ───────────────────────────────────────────────────────

export const BUILT_IN_TEMPLATES: Record<string, PromptTemplate> = {
  'bug-fix': {
    key: 'bug-fix',
    name: 'Bug Fix',
    description: 'Structured prompt for debugging and fixing a specific issue',
    tags: ['debugging', 'code'],
    suggestedModifier: 'default',
    template: `Identify and fix the {{bug_type}} bug in {{file_or_module}}.

Context: {{context}}
Language / framework: {{language}}

Expected behaviour: {{expected}}
Actual behaviour: {{actual}}

Provide:
1. Root cause analysis
2. The fix with code
3. A regression test to prevent recurrence`,
    variables: [
      {
        name: 'bug_type',
        description: 'Type of bug',
        placeholder: 'null pointer / race condition / off-by-one',
        required: true,
      },
      {
        name: 'file_or_module',
        description: 'File or module affected',
        placeholder: 'auth/token.ts',
        required: true,
      },
      {
        name: 'context',
        description: 'Relevant background',
        placeholder: 'happens on login with expired token',
        required: false,
      },
      {
        name: 'language',
        description: 'Language / framework',
        placeholder: 'TypeScript, Express',
        required: false,
      },
      {
        name: 'expected',
        description: 'Expected behaviour',
        placeholder: 'returns 401',
        required: true,
      },
      {
        name: 'actual',
        description: 'Actual behaviour',
        placeholder: 'throws unhandled exception',
        required: true,
      },
    ],
  },

  'code-review': {
    key: 'code-review',
    name: 'Code Review',
    description: 'Structured review with scope and focus areas',
    tags: ['review', 'code quality'],
    suggestedModifier: 'critic',
    template: `Review the following {{language}} code in {{file_or_module}}.

Scope: {{scope}}
Focus areas: {{focus}}

For each issue found, provide:
1. Severity (critical / major / minor)
2. Description of the problem
3. Suggested fix with code example

Also note any positives worth preserving.`,
    variables: [
      {
        name: 'language',
        description: 'Language / framework',
        placeholder: 'TypeScript',
        required: false,
      },
      {
        name: 'file_or_module',
        description: 'File or module to review',
        placeholder: 'src/auth/token.ts',
        required: true,
      },
      {
        name: 'scope',
        description: 'What to focus on',
        placeholder: 'the token refresh logic',
        required: false,
      },
      {
        name: 'focus',
        description: 'Specific concerns',
        placeholder: 'security, error handling, performance',
        required: false,
      },
    ],
  },

  architecture: {
    key: 'architecture',
    name: 'Architecture Design',
    description: 'System design with constraints and trade-offs',
    tags: ['architecture', 'system design'],
    suggestedModifier: 'architect',
    template: `Design the architecture for {{system}}.

Requirements:
- {{requirements}}

Constraints: {{constraints}}
Scale: {{scale}}

Cover:
1. High-level component diagram (described in text)
2. Data flow between components
3. Key trade-offs and the chosen approach
4. Technology choices with rationale
5. Open questions that need resolution`,
    variables: [
      {
        name: 'system',
        description: 'System or feature to design',
        placeholder: 'a real-time notification system',
        required: true,
      },
      {
        name: 'requirements',
        description: 'Functional requirements',
        placeholder: 'push to web and mobile, support 10k concurrent users',
        required: true,
      },
      {
        name: 'constraints',
        description: 'Technical or business constraints',
        placeholder: 'existing AWS infrastructure, no new databases',
        required: false,
      },
      {
        name: 'scale',
        description: 'Expected scale',
        placeholder: '100k users, 1M events/day',
        required: false,
      },
    ],
  },

  refactor: {
    key: 'refactor',
    name: 'Refactor',
    description: 'Targeted refactor with clear goals and constraints',
    tags: ['refactor', 'code quality'],
    suggestedModifier: 'deep',
    template: `Refactor {{file_or_module}} to {{goal}}.

Current problem: {{problem}}
Language / framework: {{language}}

Constraints:
- Preserve all existing behaviour (no functional changes)
- {{constraints}}

Provide:
1. Refactored code
2. Explanation of each change
3. Any risks or caveats`,
    variables: [
      {
        name: 'file_or_module',
        description: 'File or module to refactor',
        placeholder: 'src/utils/date-helpers.ts',
        required: true,
      },
      {
        name: 'goal',
        description: 'Refactoring goal',
        placeholder: 'improve readability and remove duplication',
        required: true,
      },
      {
        name: 'problem',
        description: 'What is wrong currently',
        placeholder: 'deeply nested conditionals, repeated date parsing logic',
        required: false,
      },
      {
        name: 'language',
        description: 'Language / framework',
        placeholder: 'TypeScript',
        required: false,
      },
      {
        name: 'constraints',
        description: 'Additional constraints',
        placeholder: 'no new dependencies',
        required: false,
      },
    ],
  },

  'test-generation': {
    key: 'test-generation',
    name: 'Test Generation',
    description: 'Tests with coverage goals and edge cases',
    tags: ['testing', 'code quality'],
    suggestedModifier: 'spec',
    template: `Write {{test_type}} tests for {{file_or_module}}.

Function / feature under test: {{target}}
Language / framework: {{language}}
Test framework: {{test_framework}}

Coverage goals:
- {{coverage_goals}}

Include edge cases for: {{edge_cases}}`,
    variables: [
      {
        name: 'test_type',
        description: 'Type of tests',
        placeholder: 'unit',
        required: true,
      },
      {
        name: 'file_or_module',
        description: 'File or module to test',
        placeholder: 'src/auth/token.ts',
        required: true,
      },
      {
        name: 'target',
        description: 'Specific function or feature',
        placeholder: 'validateToken()',
        required: false,
      },
      {
        name: 'language',
        description: 'Language / framework',
        placeholder: 'TypeScript, Node.js',
        required: false,
      },
      {
        name: 'test_framework',
        description: 'Test framework',
        placeholder: 'Vitest',
        required: false,
      },
      {
        name: 'coverage_goals',
        description: 'Coverage goals',
        placeholder: 'happy path, expired token, malformed token',
        required: false,
      },
      {
        name: 'edge_cases',
        description: 'Edge cases to cover',
        placeholder: 'null input, empty string, unicode characters',
        required: false,
      },
    ],
  },

  'explain-code': {
    key: 'explain-code',
    name: 'Explain Code',
    description: 'Code explanation at a specific audience level',
    tags: ['explanation', 'documentation'],
    suggestedModifier: 'default',
    template: `Explain the following {{language}} code in {{file_or_module}}.

Target audience: {{audience}}
Focus: {{focus}}

{{code}}

Cover:
1. What it does (high-level)
2. How it works (step-by-step)
3. Why it is designed this way (if notable)
4. Any gotchas or non-obvious behaviour`,
    variables: [
      {
        name: 'language',
        description: 'Language / framework',
        placeholder: 'TypeScript',
        required: false,
      },
      {
        name: 'file_or_module',
        description: 'File or module',
        placeholder: 'src/queue/worker.ts',
        required: false,
      },
      {
        name: 'audience',
        description: 'Who this explanation is for',
        placeholder: 'a junior developer unfamiliar with queues',
        required: false,
      },
      {
        name: 'focus',
        description: 'What to emphasise',
        placeholder: 'the retry logic and backoff strategy',
        required: false,
      },
      {
        name: 'code',
        description: 'The code to explain (paste here or describe it)',
        placeholder: '(paste code here)',
        required: true,
      },
    ],
  },

  'pr-description': {
    key: 'pr-description',
    name: 'PR Description',
    description: 'PR title, summary, and test plan from code changes',
    tags: ['git', 'documentation'],
    suggestedModifier: 'spec',
    template: `Write a pull request description for the following change.

Change summary: {{summary}}
Files changed: {{files}}
Motivation: {{motivation}}

Format:
## Summary
(2–4 bullet points of what changed)

## Why
(Business or technical motivation)

## Test plan
(Checklist of how to verify the change)

## Notes
(Any deployment concerns, follow-ups, or caveats)`,
    variables: [
      {
        name: 'summary',
        description: 'What the PR does',
        placeholder: 'adds rate limiting to the /auth/login endpoint',
        required: true,
      },
      {
        name: 'files',
        description: 'Key files changed',
        placeholder: 'src/auth/login.ts, src/middleware/rate-limit.ts',
        required: false,
      },
      {
        name: 'motivation',
        description: 'Why this change is needed',
        placeholder: 'prevent brute force attacks flagged in security review',
        required: false,
      },
    ],
  },

  'incident-postmortem': {
    key: 'incident-postmortem',
    name: 'Incident Postmortem',
    description: 'Post-incident analysis with timeline and action items',
    tags: ['ops', 'incident management'],
    suggestedModifier: 'deep',
    template: `Write an incident postmortem for the following outage.

Service: {{service}}
Duration: {{duration}}
Severity: {{severity}}
Impact: {{impact}}
Timeline: {{timeline}}

Include:
1. Executive summary (2–3 sentences)
2. Timeline of events
3. Root cause (primary + contributing factors)
4. What went well
5. What went wrong
6. Action items with owners and due dates`,
    variables: [
      {
        name: 'service',
        description: 'Affected service',
        placeholder: 'payments-api',
        required: true,
      },
      {
        name: 'duration',
        description: 'Outage duration',
        placeholder: '47 minutes',
        required: true,
      },
      {
        name: 'severity',
        description: 'Severity level',
        placeholder: 'SEV-2',
        required: false,
      },
      {
        name: 'impact',
        description: 'User / business impact',
        placeholder: 'checkout unavailable for EU users, ~$12k revenue impact',
        required: true,
      },
      {
        name: 'timeline',
        description: 'Key events with timestamps',
        placeholder: '14:02 alert fired, 14:23 root cause identified, 14:49 fix deployed',
        required: false,
      },
    ],
  },
};

// ─── resolveTemplate ──────────────────────────────────────────────────────────

/**
 * Fills a template's {{variable}} placeholders with the provided values.
 *
 * - Missing required variables throw `TemplateVariableError`
 * - Missing optional variables are replaced with empty string
 * - Unknown template key falls back to returning the raw variables as a plain prompt
 * - User-defined templates in `userTemplates` override built-ins on key conflict
 */
export function resolveTemplate(
  key: string,
  variables: Record<string, string>,
  userTemplates: Record<string, Partial<PromptTemplate>> = {}
): string {
  // Merge: user templates win over built-ins
  const builtIn = BUILT_IN_TEMPLATES[key];
  const userDefined = userTemplates[key];

  let tpl: PromptTemplate | undefined;

  if (builtIn && userDefined) {
    tpl = { ...builtIn, ...userDefined } as PromptTemplate;
  } else if (builtIn) {
    tpl = builtIn;
  } else if (userDefined && userDefined.template) {
    tpl = {
      key,
      name: userDefined.name ?? key,
      description: userDefined.description ?? `Custom template: ${key}`,
      tags: userDefined.tags ?? [],
      template: userDefined.template,
      variables: userDefined.variables ?? [],
      suggestedModifier: userDefined.suggestedModifier,
    };
  }

  if (!tpl) {
    // Unknown key — compose a best-effort prompt from variables
    const entries = Object.entries(variables)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    return entries || key;
  }

  // Validate required variables
  const missing = tpl.variables
    .filter((v) => v.required && !variables[v.name]?.trim())
    .map((v) => v.name);

  if (missing.length > 0) {
    throw new TemplateVariableError(key, missing);
  }

  // Replace all {{variable}} occurrences
  let filled = tpl.template;
  for (const variable of tpl.variables) {
    const value = variables[variable.name]?.trim() ?? '';
    filled = filled.split(`{{${variable.name}}}`).join(value);
  }

  return filled;
}
