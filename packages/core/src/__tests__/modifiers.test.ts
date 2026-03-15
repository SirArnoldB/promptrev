import { describe, it, expect } from 'vitest';
import { resolveModifier, BUILT_IN_MODIFIERS } from '../modifiers';

describe('resolveModifier', () => {
  it('returns built-in modifier for known key', () => {
    const mod = resolveModifier('deep');
    expect(mod.key).toBe('deep');
    expect(mod.useLLM).toBe(true);
    expect(mod.acceptMode).toBe('diff');
  });

  it('fast modifier is rule-based (useLLM: false)', () => {
    const mod = resolveModifier('fast');
    expect(mod.useLLM).toBe(false);
    expect(mod.autoSend).toBe(true);
    expect(mod.acceptMode).toBe('auto');
  });

  it('user config overrides built-in modifier fields', () => {
    const mod = resolveModifier('deep', {
      deep: { autoSend: true },
    });
    expect(mod.key).toBe('deep');
    expect(mod.autoSend).toBe(true);
    expect(mod.useLLM).toBe(true); // still inherited
  });

  it('resolves user-defined custom modifier', () => {
    const mod = resolveModifier('backend', {
      backend: {
        systemPrompt: 'Custom backend prompt',
        acceptMode: 'diff',
      },
    });
    expect(mod.key).toBe('backend');
    expect(mod.systemPrompt).toBe('Custom backend prompt');
  });

  it('falls back to default for unknown modifier key with no user definition', () => {
    const mod = resolveModifier('unknown-modifier');
    expect(mod.useLLM).toBe(true);
    expect(mod.systemPrompt).toBe(BUILT_IN_MODIFIERS.default.systemPrompt);
  });

  it('all built-in modifiers have required fields', () => {
    for (const [key, mod] of Object.entries(BUILT_IN_MODIFIERS)) {
      expect(mod.key).toBe(key);
      expect(mod.label).toBeTruthy();
      expect(mod.description).toBeTruthy();
      expect(typeof mod.useLLM).toBe('boolean');
    }
  });
});
