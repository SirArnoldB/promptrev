import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import { resolve } from 'path';

// Path to the built binary — tests require `pnpm build` to have run first
const BIN = resolve(__dirname, '../../dist/bin/rev.js');

describe('rev CLI', () => {
  it('--mod fast enhances prompt without API call', async () => {
    const { stdout, exitCode } = await execa('node', [BIN, '--mod', 'fast', 'fix the bug in my app'], {
      env: { ...process.env, PROMPTREV_API_KEY: undefined, ANTHROPIC_API_KEY: undefined },
    });
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });

  it('--mod fast reads from stdin', async () => {
    const { stdout, exitCode } = await execa('node', [BIN, '--mod', 'fast'], {
      input: 'fix the authentication bug',
      env: { ...process.env, PROMPTREV_API_KEY: undefined, ANTHROPIC_API_KEY: undefined },
    });
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });

  it('--json outputs valid JSON with expected shape for --mod fast', async () => {
    const { stdout, exitCode } = await execa(
      'node',
      [BIN, '--mod', 'fast', '--json', 'fix the bug in my app'],
      {
        env: { ...process.env, PROMPTREV_API_KEY: undefined, ANTHROPIC_API_KEY: undefined },
      }
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('original');
    expect(parsed).toHaveProperty('revised');
    expect(parsed).toHaveProperty('modifier');
    expect(parsed).toHaveProperty('timestamp');
    expect(parsed).toHaveProperty('skipped');
  });

  it('--list-modifiers prints modifier table and exits 0', async () => {
    const { stdout, exitCode } = await execa('node', [BIN, '--list-modifiers']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Modifier');
    expect(stdout).toContain('default');
    expect(stdout).toContain('fast');
    expect(stdout).toContain('deep');
  });

  it('exits 1 with helpful message when no API key and LLM modifier', async () => {
    const { stderr, exitCode } = await execa(
      'node',
      [BIN, '--mod', 'default', 'fix the bug'],
      {
        env: { ...process.env, PROMPTREV_API_KEY: undefined, ANTHROPIC_API_KEY: undefined },
        reject: false,
      }
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('API key');
  });

  it('exits 1 with error when no prompt provided', async () => {
    const { stderr, exitCode } = await execa('node', [BIN, '--mod', 'fast'], {
      reject: false,
      // No input, no arg, isTTY will be false but stdin will end immediately
      input: '',
    });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('No prompt provided');
  });
});
