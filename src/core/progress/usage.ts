export type TokenUsage = { input: number; cacheRead: number; cacheWrite: number; output: number };

export type SessionUsage = { models: string[]; calls: number; failedCalls: number; tokens: TokenUsage };

export type CallStat = { model: string; ok: boolean; response: string | null };

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Tokens from a stored CLI envelope; anything that is not an envelope with `usage` counts as zero. */
export function parseUsage(raw: string | null): TokenUsage {
  const zero: TokenUsage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  if (!raw) return zero;
  let usage: unknown;
  try {
    usage = (JSON.parse(raw) as { usage?: unknown } | null)?.usage;
  } catch {
    return zero;
  }
  if (typeof usage !== 'object' || usage === null) return zero;
  const u = usage as Record<string, unknown>;
  return {
    input: count(u.input_tokens),
    cacheRead: count(u.cache_read_input_tokens),
    cacheWrite: count(u.cache_creation_input_tokens),
    output: count(u.output_tokens),
  };
}

/** Calls must come in the order they were made: models keep their first-use order. */
export function summarizeCalls(calls: CallStat[]): SessionUsage {
  const out: SessionUsage = { models: [], calls: calls.length, failedCalls: 0, tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 } };
  for (const c of calls) {
    if (!out.models.includes(c.model)) out.models.push(c.model);
    if (!c.ok) out.failedCalls++;
    const t = parseUsage(c.response);
    out.tokens.input += t.input;
    out.tokens.cacheRead += t.cacheRead;
    out.tokens.cacheWrite += t.cacheWrite;
    out.tokens.output += t.output;
  }
  return out;
}
