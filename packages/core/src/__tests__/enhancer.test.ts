import { describe, it, expect, vi } from 'vitest';
import { enhance } from '../enhancer';
import { ModelAdapter } from '../model-adapter';

function makeMockAdapter(response: string): ModelAdapter {
  return {
    complete: vi.fn().mockResolvedValue(response),
  };
}

describe('enhance', () => {
  it('returns skipped=true for very short prompts', async () => {
    const adapter = makeMockAdapter('Enhanced prompt');
    const result = await enhance({
      rawPrompt: 'hi',
      modifier: 'default',
      modelAdapter: adapter,
    });
    expect(result.skipped).toBe(true);
    expect(result.revised).toBe('hi');
  });

  it('calls modelAdapter.complete for LLM-based modifiers', async () => {
    const adapter = makeMockAdapter('This is the enhanced prompt.');
    const result = await enhance({
      rawPrompt: 'fix the authentication bug in my app',
      modifier: 'default',
      modelAdapter: adapter,
    });
    expect(adapter.complete).toHaveBeenCalledOnce();
    expect(result.revised).toBe('This is the enhanced prompt.');
    expect(result.skipped).toBe(false);
  });

  it('does NOT call modelAdapter for :rb modifier', async () => {
    const adapter = makeMockAdapter('Should not be called');
    const result = await enhance({
      rawPrompt: 'fix the bug in my app',
      modifier: 'rb',
      modelAdapter: adapter,
    });
    expect(adapter.complete).not.toHaveBeenCalled();
    expect(result.revised).toBeTruthy();
  });

  it('returns diff chunks when prompt is changed', async () => {
    const adapter = makeMockAdapter('Fix the authentication bug in the login module.');
    const result = await enhance({
      rawPrompt: 'fix the auth bug',
      modifier: 'default',
      modelAdapter: adapter,
    });
    expect(result.diff.length).toBeGreaterThan(0);
  });

  it('sets skipped=true when revised equals original', async () => {
    const prompt = 'Fix the authentication bug in the login module.';
    const adapter = makeMockAdapter(prompt);
    const result = await enhance({
      rawPrompt: prompt,
      modifier: 'default',
      modelAdapter: adapter,
    });
    expect(result.skipped).toBe(true);
    expect(result.diff).toHaveLength(0);
  });

  it('falls back to rule-based if LLM throws non-abort error', async () => {
    const adapter: ModelAdapter = {
      complete: vi.fn().mockRejectedValue(new Error('Network error')),
    };
    const result = await enhance({
      rawPrompt: 'fix the bug in my module',
      modifier: 'default',
      modelAdapter: adapter,
    });
    expect(result.revised).toBeTruthy();
    expect(result.original).toBe('fix the bug in my module');
  });

  it('parses JSON response and populates signal', async () => {
    const jsonResponse = JSON.stringify({
      revised: 'Fix the authentication bug in the login module.',
      signal: 'Added specificity and scope',
    });
    const adapter = makeMockAdapter(jsonResponse);
    const result = await enhance({
      rawPrompt: 'fix the auth bug',
      modifier: 'default',
      modelAdapter: adapter,
    });
    expect(result.revised).toBe('Fix the authentication bug in the login module.');
    expect(result.signal).toBe('Added specificity and scope');
  });

  it('falls back gracefully when LLM returns plain text instead of JSON', async () => {
    const adapter = makeMockAdapter('Fix the authentication bug in the login module.');
    const result = await enhance({
      rawPrompt: 'fix the auth bug',
      modifier: 'default',
      modelAdapter: adapter,
    });
    expect(result.revised).toBe('Fix the authentication bug in the login module.');
    expect(result.signal).toBeUndefined();
  });

  it('propagates AbortError from modelAdapter', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    const adapter: ModelAdapter = {
      complete: vi.fn().mockRejectedValue(abortError),
    };
    await expect(
      enhance({
        rawPrompt: 'fix the auth bug in my app',
        modifier: 'default',
        modelAdapter: adapter,
      })
    ).rejects.toThrow('Aborted');
  });
});
