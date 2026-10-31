import { Validator, type OutputUnit } from '@cfworker/json-schema';
import type { LlmKind } from '@/core/domain';
import type { Deps, LlmErrorCode, LlmResult } from '@/core/ports';
import { getSettings } from '@/core/db/repos/settings';
import { insertLlmCall } from '@/core/db/repos/llmCalls';

const DEFAULT_MAX_ATTEMPTS = 2;
const RETRYABLE: ReadonlySet<LlmErrorCode> = new Set(['timeout', 'invalid_json', 'schema', 'check', 'cli_error']);

// Interprets the schema without code generation: the app's CSP forbids eval and new Function.
const validators = new WeakMap<object, Validator>();

function validatorFor(schema: object): Validator {
  let v = validators.get(schema);
  if (!v) {
    v = new Validator(schema, '2019-09', false);
    validators.set(schema, v);
  }
  return v;
}

function errorsText(errors: OutputUnit[]): string {
  return errors.map((e) => `${e.instanceLocation} ${e.error}`).join(', ');
}

export async function callStructured<T>(
  deps: Deps,
  kind: LlmKind,
  userPrompt: string,
  opts: { sessionId?: number; check?: (data: T) => string | null; maxAttempts?: number; resume?: string | null; persist?: boolean } = {},
): Promise<LlmResult<T>> {
  const settings = await getSettings(deps.db);
  const prompt = await deps.prompts.load(kind);
  const language = settings.nativeLanguage === 'ru' ? 'Russian' : 'English';
  const model = settings.models[kind];
  const effort = settings.efforts[kind];
  const validate = validatorFor(prompt.schema);

  let last: LlmResult<T> | undefined;
  for (let attempt = 1; attempt <= (opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS); attempt++) {
    const res = await deps.llm.call({
      kind,
      systemPrompt: prompt.system.replaceAll('{{nativeLanguage}}', language),
      userPrompt,
      schema: prompt.schema,
      model,
      effort,
      budgetUsd: settings.budgetUsd,
      timeoutMs: kind === 'generate_session' ? 300000 : 120000,
      ...(opts.persist ? { persist: true } : {}),
      ...(opts.resume !== undefined ? { resume: opts.resume } : {}),
    });
    last = checked<T>(res, validate, opts.check);
    await insertLlmCall(deps.db, {
      sessionId: opts.sessionId ?? null,
      kind,
      model,
      costUsd: last.costUsd,
      durationMs: last.durationMs,
      ok: last.ok,
      error: last.ok ? null : `${last.code}: ${last.message}`,
      response: last.raw,
      createdAt: deps.clock.now(),
    });
    if (last.ok || !RETRYABLE.has(last.code)) break;
  }
  return last as LlmResult<T>;
}

function checked<T>(
  res: LlmResult<unknown>,
  validate: Validator,
  check: ((data: T) => string | null) | undefined,
): LlmResult<T> {
  if (!res.ok) return res;
  const base = { costUsd: res.costUsd, durationMs: res.durationMs, raw: res.raw, ...(res.sessionId ? { sessionId: res.sessionId } : {}) };
  const verdict = validate.validate(res.data);
  if (!verdict.valid) {
    return { ok: false, code: 'schema', message: errorsText(verdict.errors), ...base };
  }
  const data = res.data as T;
  const problem = check?.(data) ?? null;
  if (problem !== null) return { ok: false, code: 'check', message: problem, ...base };
  return { ok: true, data, ...base };
}
