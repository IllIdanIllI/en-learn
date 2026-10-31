import type { LlmErrorCode } from '@/core/ports';

export type EnvelopeResult =
  | { ok: true; data: unknown; costUsd: number; sessionId?: string }
  | { ok: false; code: LlmErrorCode; message: string; costUsd: number };

const NOT_SIGNED_IN = /not logged in|\blog ?in\b|authenticat|\/login/i;

function isJsonObject(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/**
 * A run that exited non-zero without a JSON envelope on stdout (the CLI printed plain text, or nothing). Sign-in
 * problems are told apart by their wording in stdout and stderr; anything else is `cli_error` carrying both streams.
 * Null when stdout is an envelope: `parseEnvelope` reads its own error then.
 */
export function failedRun(res: { code: number | null; stdout: string; stderr: string }): { code: 'not_signed_in' | 'cli_error'; message: string } | null {
  if (res.code === 0 || isJsonObject(res.stdout)) return null;
  const message = [res.stderr.trim(), res.stdout.trim()].filter(Boolean).join('\n') || `claude exited with code ${res.code}`;
  return { code: NOT_SIGNED_IN.test(`${res.stdout}\n${res.stderr}`) ? 'not_signed_in' : 'cli_error', message };
}

export function parseEnvelope(stdout: string): EnvelopeResult {
  let env: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
    env = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, code: 'invalid_json', message: 'CLI output is not a JSON envelope', costUsd: 0 };
  }
  const costUsd = typeof env.total_cost_usd === 'number' ? env.total_cost_usd : 0;
  if (env.is_error !== true) {
    if (env.structured_output === undefined || env.structured_output === null) {
      return { ok: false, code: 'invalid_json', message: 'Envelope has no structured_output', costUsd };
    }
    const sessionId = typeof env.session_id === 'string' && env.session_id !== '' ? env.session_id : undefined;
    return { ok: true, data: env.structured_output, costUsd, ...(sessionId ? { sessionId } : {}) };
  }
  const errors = Array.isArray(env.errors) ? env.errors.filter((e): e is string => typeof e === 'string') : [];
  const text = [...errors, typeof env.result === 'string' ? env.result : ''].filter(Boolean).join('; ');
  const message = text || String(env.subtype ?? 'unknown error');
  if (env.subtype === 'error_max_budget_usd') return { ok: false, code: 'budget', message, costUsd };
  if (NOT_SIGNED_IN.test(text)) return { ok: false, code: 'not_signed_in', message, costUsd };
  return { ok: false, code: 'cli_error', message, costUsd };
}
