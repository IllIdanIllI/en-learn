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
  effort: 'high',
  budgetUsd,
  timeoutMs: 120000,
});

describe('buildClaudeArgs', () => {
  test('17 flag args then -- and the prompt, without budget', () => {
    expect(buildClaudeArgs(req(null))).toEqual([
      '-p', '--output-format', 'json', '--json-schema', '{"type":"object"}',
      '--system-prompt', 'line one\nline two', '--tools', '', '--model', 'claude-sonnet-5-5', '--effort', 'high',
      '--no-session-persistence', '--strict-mcp-config', '--safe-mode', '--disable-slash-commands', '--', 'the user prompt',
    ]);
  });

  const SID = '123e4567-e89b-42d3-a456-426614174000';

  test('persist drops --no-session-persistence and keeps the rest in place', () => {
    const a = buildClaudeArgs({ ...req(null), persist: true });
    expect(a).toEqual([
      '-p', '--output-format', 'json', '--json-schema', '{"type":"object"}',
      '--system-prompt', 'line one\nline two', '--tools', '', '--model', 'claude-sonnet-5-5', '--effort', 'high',
      '--strict-mcp-config', '--safe-mode', '--disable-slash-commands', '--', 'the user prompt',
    ]);
  });

  test('resume adds --resume <id> --fork-session after --strict-mcp-config, before the budget', () => {
    const a = buildClaudeArgs({ ...req(0.3), persist: true, resume: SID });
    expect(a.slice(11)).toEqual([
      '--effort', 'high', '--strict-mcp-config', '--safe-mode', '--disable-slash-commands', '--resume', SID, '--fork-session', '--max-budget-usd', '0.3', '--', 'the user prompt',
    ]);
    expect(a).not.toContain('--no-session-persistence');
  });

  test('resume null behaves like a first chat turn', () => {
    expect(buildClaudeArgs({ ...req(null), persist: true, resume: null })).not.toContain('--resume');
  });

  test('budget appends two args', () => {
    const a = buildClaudeArgs(req(0.3));
    expect(a).toHaveLength(21);
    expect(a.slice(-4)).toEqual(['--max-budget-usd', '0.3', '--', 'the user prompt']);
  });
});

describe('ClaudeCli', () => {
  const ok = { code: 0, stdout: success, stderr: '', timedOut: false };

  test('no budget uses claude-local-call, 19 args, prompt after --, no stdin', async () => {
    const runner = new FakeRunner([ok]);
    const r = await new ClaudeCli(runner, 'local', '/work', '/home/u').call(req(null));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ word: 'cat', n: 3 });
    const c = runner.calls[0]!;
    expect(c.scope).toBe('claude-local-call');
    expect(c.args).toHaveLength(19);
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

  test('chat shapes: persist uses claude-local-chat, resume uses claude-local-chat-next, each with -budget', async () => {
    const SID = '123e4567-e89b-42d3-a456-426614174000';
    const runner = new FakeRunner([ok, ok, ok, ok]);
    const cli = new ClaudeCli(runner, 'local', '/work', '/home/u');
    await cli.call({ ...req(null), persist: true, resume: null });
    await cli.call({ ...req(0.3), persist: true, resume: null });
    await cli.call({ ...req(null), persist: true, resume: SID });
    await cli.call({ ...req(0.3), persist: true, resume: SID });
    expect(runner.calls.map((c) => c.scope)).toEqual([
      'claude-local-chat', 'claude-local-chat-budget', 'claude-local-chat-next', 'claude-local-chat-next-budget',
    ]);
  });

  test('returns the envelope session id', async () => {
    const r = await new ClaudeCli(new FakeRunner([ok]), 'local', '/w', '/h').call({ ...req(null), persist: true });
    expect(r).toMatchObject({ ok: true, sessionId: '899551ba-7f2a-50d4-9014-08e79b4f3f71' });
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

  const run = (res: { code: number | null; stdout: string; stderr: string }) =>
    new ClaudeCli(new FakeRunner([{ ...res, timedOut: false }]), 'local', '/w', '/h').call(req(null));

  test('a sign-in message on stderr with empty stdout maps to not_signed_in', async () => {
    const r = await run({ code: 1, stdout: '', stderr: 'Not logged in · Please run /login' });
    expect(r).toMatchObject({ ok: false, code: 'not_signed_in', message: 'Not logged in · Please run /login' });
  });

  test('a sign-in message on stdout (plain text, non-zero exit) maps to not_signed_in', async () => {
    const r = await run({ code: 1, stdout: 'Invalid API key · Please run /login\n', stderr: '' });
    expect(r).toMatchObject({ ok: false, code: 'not_signed_in' });
  });

  test('plain-text stdout with non-zero exit is cli_error and the message carries stderr and stdout', async () => {
    const r = await run({ code: 2, stdout: 'partial output', stderr: 'segfault' });
    expect(r).toMatchObject({ ok: false, code: 'cli_error' });
    if (!r.ok) expect(r.message).toBe('segfault\npartial output');
  });

  test('non-zero exit without any output names the exit code', async () => {
    const r = await run({ code: 3, stdout: '', stderr: '' });
    expect(r).toMatchObject({ ok: false, code: 'cli_error', message: 'claude exited with code 3' });
  });

  test('a JSON envelope on stdout is read as an envelope even when the exit is non-zero', async () => {
    const budget = readFileSync('tests/fixtures/cli/envelope-budget.json', 'utf8');
    const r = await run({ code: 1, stdout: budget, stderr: 'Please run /login' });
    expect(r).toMatchObject({ ok: false, code: 'budget' });
  });
});
