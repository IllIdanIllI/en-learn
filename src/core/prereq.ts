import type { ProcessRunner } from '@/core/ports';
import { CLAUDE_LOCATIONS, scopeName, type ClaudeLocation } from '@/core/llm/claude';

const PROBE_TIMEOUT_MS = 10000;

export type PrereqEntry = { location: ClaudeLocation; path: string; result: 'missing' | 'not_signed_in' | 'error' };

export type PrereqResult =
  | { ok: true; location: ClaudeLocation; version: string }
  | { ok: false; checked: PrereqEntry[] };

/** Spec 10.2: first location that is installed and signed in wins. */
export async function checkPrerequisites(runner: ProcessRunner): Promise<PrereqResult> {
  const checked: PrereqEntry[] = [];
  for (const { loc, path } of CLAUDE_LOCATIONS) {
    let version: string;
    try {
      const v = await runner.run(scopeName(loc, 'version'), ['--version'], { timeoutMs: PROBE_TIMEOUT_MS });
      if (v.timedOut || v.code !== 0) {
        checked.push({ location: loc, path, result: 'missing' });
        continue;
      }
      version = v.stdout.trim();
    } catch {
      checked.push({ location: loc, path, result: 'missing' });
      continue;
    }

    let loggedIn: unknown;
    try {
      const a = await runner.run(scopeName(loc, 'auth'), ['auth', 'status', '--json'], { timeoutMs: PROBE_TIMEOUT_MS });
      if (a.timedOut || a.code !== 0) throw new Error('auth status failed');
      loggedIn = (JSON.parse(a.stdout) as { loggedIn?: unknown }).loggedIn;
    } catch {
      checked.push({ location: loc, path, result: 'error' });
      continue;
    }
    if (loggedIn !== true) {
      checked.push({ location: loc, path, result: 'not_signed_in' });
      continue;
    }
    return { ok: true, location: loc, version };
  }
  return { ok: false, checked };
}
