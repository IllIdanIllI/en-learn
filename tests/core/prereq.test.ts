import { describe, expect, test } from 'vitest';
import { FakeRunner } from '@/adapters/test/fakeRunner';
import { checkPrerequisites } from '@/core/prereq';
import type { RunResult } from '@/core/ports';

const ok = (stdout: string): RunResult => ({ code: 0, stdout, stderr: '', timedOut: false });
const fail: RunResult = { code: 1, stdout: '', stderr: 'nope', timedOut: false };
const timeout: RunResult = { code: null, stdout: '', stderr: '', timedOut: true };
const missing = () => new Error('spawn ENOENT');

describe('checkPrerequisites', () => {
  test('skips a missing location and uses the next signed-in one', async () => {
    const runner = new FakeRunner([
      missing(),
      ok('2.1.308 (Claude Code)\n'),
      ok('{"loggedIn":true}'),
    ]);
    const res = await checkPrerequisites(runner);
    expect(res).toEqual({ ok: true, location: 'legacy', version: '2.1.308 (Claude Code)' });
    expect(runner.calls.map((c) => c.scope)).toEqual([
      'claude-local-version',
      'claude-legacy-version',
      'claude-legacy-auth',
    ]);
  });

  test('reports all four locations as missing when none is installed', async () => {
    const runner = new FakeRunner([missing(), fail, timeout, missing()]);
    const res = await checkPrerequisites(runner);
    expect(res).toEqual({
      ok: false,
      checked: [
        { location: 'local', path: '$HOME/.local/bin/claude', result: 'missing' },
        { location: 'legacy', path: '$HOME/.claude/local/claude', result: 'missing' },
        { location: 'homebrew', path: '/opt/homebrew/bin/claude', result: 'missing' },
        { location: 'usr-local', path: '/usr/local/bin/claude', result: 'missing' },
      ],
    });
    expect(runner.calls).toHaveLength(4);
  });

  test('installed but not signed in is not_signed_in', async () => {
    const runner = new FakeRunner([
      ok('2.1.308\n'),
      ok('{"loggedIn":false}'),
      missing(),
      missing(),
      missing(),
    ]);
    const res = await checkPrerequisites(runner);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.checked.map((c) => c.result)).toEqual(['not_signed_in', 'missing', 'missing', 'missing']);
    expect(res.checked[0]).toEqual({ location: 'local', path: '$HOME/.local/bin/claude', result: 'not_signed_in' });
  });

  test.each([
    ['auth runner throws', [ok('2.1.308\n'), missing()]],
    ['auth times out', [ok('2.1.308\n'), timeout]],
    ['auth exits non-zero', [ok('2.1.308\n'), fail]],
    ['auth stdout is not JSON', [ok('2.1.308\n'), ok('not json')]],
  ])('%s is error', async (_name, first) => {
    const runner = new FakeRunner([...first, missing(), missing(), missing()]);
    const res = await checkPrerequisites(runner);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.checked[0]?.result).toBe('error');
  });

  test('loggedIn that is not the boolean true is not_signed_in', async () => {
    const runner = new FakeRunner([ok('2.1.308\n'), ok('{"loggedIn":"true"}'), missing(), missing(), missing()]);
    const res = await checkPrerequisites(runner);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.checked[0]?.result).toBe('not_signed_in');
  });

  test('passes the exact scope names, args and options', async () => {
    const runner = new FakeRunner([
      ok('1.0.0\n'),
      ok('{"loggedIn":true}'),
    ]);
    await checkPrerequisites(runner);
    expect(runner.calls).toEqual([
      { scope: 'claude-local-version', args: ['--version'], opts: { timeoutMs: 10000 } },
      { scope: 'claude-local-auth', args: ['auth', 'status', '--json'], opts: { timeoutMs: 10000 } },
    ]);
  });
});
