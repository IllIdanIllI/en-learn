import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { ClaudeCli } from '@/adapters/tauri/claudeCli';
import { FakeRunner } from '@/adapters/test/fakeRunner';
import { buildClaudeArgs } from '@/core/llm/claude';
import type { LlmRequest } from '@/core/ports';

const success = readFileSync('tests/fixtures/cli/envelope-success.json', 'utf8');
const req = (budgetUsd: number | null): LlmRequest => ({
  kind: 'grade',
  systemPrompt: 'line one\nline two',
  userPrompt: 'the user prompt',
  schema: { type: 'object' },
  model: 'claude-sonnet-5-5',
  budgetUsd,
  timeoutMs: 120000,
});

describe('buildClaudeArgs', () => {
  test('13 flag args then -- and the prompt, without budget', () => {
    expect(buildClaudeArgs(req(null))).toEqual([
      '-p', '--output-format', 'json', '--json-schema', '{"type":"object"}',
      '--system-prompt', 'line one\nline two', '--tools', '', '--model', 'claude-sonnet-5-5',
      '--no-session-persistence', '--strict-mcp-config', '--', 'the user prompt',
    ]);
  });

  test('budget appends two args', () => {
    const a = buildClaudeArgs(req(0.3));
    expect(a).toHaveLength(17);
    expect(a.slice(-4)).toEqual(['--max-budget-usd', '0.3', '--', 'the user prompt']);
  });
});

describe('ClaudeCli', () => {
  const ok = { code: 0, stdout: success, stderr: '', timedOut: false };

  test('no budget uses claude-local-call, 15 args, prompt after --, no stdin', async () => {
    const runner = new FakeRunner([ok]);
    const r = await new ClaudeCli(runner, 'local', '/work', '/home/u').call(req(null));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ word: 'cat', n: 3 });
    const c = runner.calls[0]!;
    expect(c.scope).toBe('claude-local-call');
    expect(c.args).toHaveLength(15);
    expect(c.args[8]).toBe('');
    expect(c.args.slice(-2)).toEqual(['--', 'the user prompt']);
    expect(c.opts.stdin).toBeUndefined();
    expect(c.opts.cwd).toBe('/work');
    expect(c.opts.timeoutMs).toBe(120000);
    expect(c.opts.env).toEqual({ PATH: '/home/u/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' });
  });

  test('budget uses claude-local-call-budget and ends with the cap, --, prompt', async () => {
    const runner = new FakeRunner([ok]);
    await new ClaudeCli(runner, 'local', '/work', '/home/u').call(req(0.3));
    expect(runner.calls[0]!.scope).toBe('claude-local-call-budget');
    expect(runner.calls[0]!.args.slice(-4)).toEqual(['--max-budget-usd', '0.3', '--', 'the user prompt']);
  });

  test('uses the given location in the scope name', async () => {
    const runner = new FakeRunner([ok]);
    await new ClaudeCli(runner, 'homebrew', '/work', '/home/u').call(req(null));
    expect(runner.calls[0]!.scope).toBe('claude-homebrew-call');
  });

  test('timedOut maps to timeout', async () => {
    const runner = new FakeRunner([{ code: null, stdout: '', stderr: '', timedOut: true }]);
    const r = await new ClaudeCli(runner, 'local', '/w', '/h').call(req(null));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('timeout');
  });

  test('runner throw maps to spawn_failed', async () => {
    const runner = new FakeRunner([new Error('no such file')]);
    const r = await new ClaudeCli(runner, 'local', '/w', '/h').call(req(null));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('spawn_failed');
      expect(r.message).toBe('no such file');
    }
  });

  test('empty stdout with non-zero exit maps to cli_error carrying stderr', async () => {
    const runner = new FakeRunner([{ code: 1, stdout: '', stderr: 'bad flag', timedOut: false }]);
    const r = await new ClaudeCli(runner, 'local', '/w', '/h').call(req(null));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('cli_error');
      expect(r.message).toBe('bad flag');
    }
  });
});
