import { describe, it, expect } from 'vitest';
import { ruleBasedEnhance } from '../rule-based';

describe('ruleBasedEnhance', () => {
  it('capitalizes first letter', () => {
    expect(ruleBasedEnhance('fix the bug')).toMatch(/^Fix/);
  });

  it('ensures end punctuation', () => {
    const result = ruleBasedEnhance('fix the bug');
    expect(result).toMatch(/[.!?]$/);
  });

  it('removes filler word "idk"', () => {
    const result = ruleBasedEnhance('fix the bug idk');
    expect(result.toLowerCase()).not.toContain('idk');
  });

  it('removes filler phrase "or something"', () => {
    const result = ruleBasedEnhance('make it faster or something');
    expect(result.toLowerCase()).not.toContain('or something');
  });

  it('fixes common typo "recieve"', () => {
    const result = ruleBasedEnhance('fix the recieve function');
    expect(result.toLowerCase()).toContain('receive');
    expect(result.toLowerCase()).not.toContain('recieve');
  });

  it('prepends Please when no imperative verb', () => {
    const result = ruleBasedEnhance('null check on user.profile');
    expect(result).toMatch(/^Please/);
  });

  it('does not prepend Please when prompt starts with verb', () => {
    const result = ruleBasedEnhance('fix the null check');
    expect(result).not.toMatch(/^Please/);
  });

  it('preserves already well-formed prompts structurally', () => {
    const input = 'Fix the null pointer exception in the user service.';
    const result = ruleBasedEnhance(input);
    expect(result).toContain('null pointer');
  });
});
