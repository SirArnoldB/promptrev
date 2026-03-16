import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_TEMPLATES,
  resolveTemplate,
  TemplateVariableError,
} from '../templates';

describe('BUILT_IN_TEMPLATES', () => {
  it('contains all 8 expected keys', () => {
    const keys = Object.keys(BUILT_IN_TEMPLATES);
    expect(keys).toContain('bug-fix');
    expect(keys).toContain('code-review');
    expect(keys).toContain('architecture');
    expect(keys).toContain('refactor');
    expect(keys).toContain('test-generation');
    expect(keys).toContain('explain-code');
    expect(keys).toContain('pr-description');
    expect(keys).toContain('incident-postmortem');
    expect(keys).toHaveLength(8);
  });

  it('each template has required fields', () => {
    for (const tpl of Object.values(BUILT_IN_TEMPLATES)) {
      expect(typeof tpl.key).toBe('string');
      expect(typeof tpl.name).toBe('string');
      expect(typeof tpl.description).toBe('string');
      expect(Array.isArray(tpl.tags)).toBe(true);
      expect(typeof tpl.template).toBe('string');
      expect(Array.isArray(tpl.variables)).toBe(true);
    }
  });

  it('all {{variable}} placeholders in template have a matching variable definition', () => {
    for (const tpl of Object.values(BUILT_IN_TEMPLATES)) {
      const placeholders = [...tpl.template.matchAll(/\{\{(\w+)\}\}/g)].map(
        (m) => m[1]
      );
      const defined = tpl.variables.map((v) => v.name);
      for (const p of placeholders) {
        expect(defined).toContain(p);
      }
    }
  });
});

describe('resolveTemplate — variable substitution', () => {
  it('fills all required and optional variables', () => {
    const result = resolveTemplate('bug-fix', {
      bug_type: 'null pointer',
      file_or_module: 'src/auth/token.ts',
      context: 'happens on login',
      language: 'TypeScript',
      expected: 'returns 401',
      actual: 'throws exception',
    });
    expect(result).toContain('null pointer');
    expect(result).toContain('src/auth/token.ts');
    expect(result).toContain('happens on login');
    expect(result).toContain('TypeScript');
    expect(result).toContain('returns 401');
    expect(result).toContain('throws exception');
    // No remaining placeholders
    expect(result).not.toMatch(/\{\{\w+\}\}/);
  });

  it('replaces optional missing variables with empty string', () => {
    const result = resolveTemplate('bug-fix', {
      bug_type: 'race condition',
      file_or_module: 'src/queue.ts',
      expected: 'processes once',
      actual: 'processes twice',
      // context and language omitted
    });
    expect(result).not.toMatch(/\{\{\w+\}\}/);
    expect(result).toContain('race condition');
  });
});

describe('resolveTemplate — required variable enforcement', () => {
  it('throws TemplateVariableError when a required variable is missing', () => {
    expect(() =>
      resolveTemplate('bug-fix', {
        // bug_type is required but omitted
        file_or_module: 'src/auth/token.ts',
        expected: 'returns 401',
        actual: 'throws exception',
      })
    ).toThrow(TemplateVariableError);
  });

  it('error message names the missing variables', () => {
    let caught: TemplateVariableError | null = null;
    try {
      resolveTemplate('bug-fix', {
        file_or_module: 'src/auth/token.ts',
        // bug_type, expected, actual all missing
      });
    } catch (e) {
      caught = e as TemplateVariableError;
    }
    expect(caught).not.toBeNull();
    expect(caught!.missingVariables).toContain('bug_type');
    expect(caught!.missingVariables).toContain('expected');
    expect(caught!.missingVariables).toContain('actual');
    expect(caught!.templateKey).toBe('bug-fix');
  });

  it('does not throw when only optional variables are missing', () => {
    expect(() =>
      resolveTemplate('code-review', {
        file_or_module: 'src/auth/token.ts',
        // language, scope, focus all optional
      })
    ).not.toThrow();
  });
});

describe('resolveTemplate — unknown key fallback', () => {
  it('returns a best-effort prompt from variables for unknown key', () => {
    const result = resolveTemplate('nonexistent-key', {
      thing: 'value1',
      other: 'value2',
    });
    expect(result).toContain('value1');
    expect(result).toContain('value2');
  });

  it('returns key as fallback when variables are empty', () => {
    const result = resolveTemplate('nonexistent-key', {});
    expect(result).toBe('nonexistent-key');
  });
});

describe('resolveTemplate — user override', () => {
  it('user template overrides built-in on same key', () => {
    const result = resolveTemplate(
      'bug-fix',
      {
        bug_type: 'race condition',
        file_or_module: 'src/queue.ts',
        expected: 'once',
        actual: 'twice',
      },
      {
        'bug-fix': {
          template: 'Custom: {{bug_type}} in {{file_or_module}}. Expected: {{expected}}. Actual: {{actual}}.',
        },
      }
    );
    expect(result).toMatch(/^Custom:/);
    expect(result).toContain('race condition');
  });

  it('user-defined template with unknown key works if template is provided', () => {
    const result = resolveTemplate(
      'my-template',
      { topic: 'authentication' },
      {
        'my-template': {
          name: 'My Template',
          template: 'Explain {{topic}} in depth.',
          variables: [
            { name: 'topic', description: 'Topic', placeholder: 'auth', required: true },
          ],
        },
      }
    );
    expect(result).toBe('Explain authentication in depth.');
  });

  it('unknown user template without template string falls back gracefully', () => {
    const result = resolveTemplate(
      'no-template-key',
      { a: 'hello' },
      { 'no-template-key': { name: 'No template', description: 'test' } }
    );
    expect(result).toContain('hello');
  });
});
