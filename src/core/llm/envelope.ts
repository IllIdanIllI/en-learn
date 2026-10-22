import type { LlmErrorCode } from '@/core/ports';

export type EnvelopeResult =
  | { ok: true; data: unknown; costUsd: number }
  | { ok: false; code: LlmErrorCode; message: string; costUsd: number };

const NOT_SIGNED_IN = /not logged in|\blog ?in\b|authenticat|\/login/i;

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
    return { ok: true, data: env.structured_output, costUsd };
  }
  const errors = Array.isArray(env.errors) ? env.errors.filter((e): e is string => typeof e === 'string') : [];
  const text = [...errors, typeof env.result === 'string' ? env.result : ''].filter(Boolean).join('; ');
  const message = text || String(env.subtype ?? 'unknown error');
  if (env.subtype === 'error_max_budget_usd') return { ok: false, code: 'budget', message, costUsd };
  if (NOT_SIGNED_IN.test(text)) return { ok: false, code: 'not_signed_in', message, costUsd };
  return { ok: false, code: 'cli_error', message, costUsd };
}
