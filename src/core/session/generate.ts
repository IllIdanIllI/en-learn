import type { Deps, LlmErrorCode } from '@/core/ports';
import type { GeneratedSession, ValidationResult } from '@/core/llm/types';
import { callStructured } from '@/core/llm/call';
import { formatTitleDate } from '@/core/dates';
import { t } from '@/core/i18n';
import { getSettings } from '@/core/db/repos/settings';
import {
  cleanupDrafts, deleteSession, getSessionByDate, insertDraftSession, setSessionStatus,
} from '@/core/db/repos/sessions';
import { listSpellingWords } from '@/core/db/repos/spelling';
import { getSpellingStates } from '@/core/progress/history';
import { selectSpellingWords } from '@/core/schedule/spelling';
import { forgetAwaiting } from '@/core/grading/grade';
import { buildGenerationContext, renderContext, type GenerationContext } from './context';
import { writeBlocks } from './store';
import { applyValidation, renderValidationInput, violations, type Defects } from './validation';

export { cleanupDrafts };

/** `code` lets the UI show its own text; without it the message is shown as is. */
export type GenerateErrorCode = LlmErrorCode | 'session_exists';
/** Where a generation run is: the model writes, the code and a reviewer check, the result is saved. */
export type GenStage = 'writing' | 'checking' | 'saving';
/** Reports the stage and the attempt number (1 or 2) a run is in. */
export type OnStage = (stage: GenStage, attempt: number) => void;
export type GenerateResult = { ok: true; sessionId: number } | { ok: false; message: string; code?: GenerateErrorCode };

const MAX_ATTEMPTS = 2;
/** Retrying cannot help with these. */
const FATAL = new Set(['not_signed_in', 'budget', 'spawn_failed']);

function title(lang: 'ru' | 'en', ctx: GenerationContext): string {
  const date = formatTitleDate(ctx.date, lang);
  if (ctx.weekNo !== null && ctx.taskTopic) {
    return t(lang, 'title.week', { n: ctx.weekNo, date, topic: ctx.taskTopic.topic.title });
  }
  return t(lang, 'title.review', { date });
}

/**
 * Spec 6.2 steps 2-5. The draft row is inserted before the LLM calls so their llm_call rows carry its id
 * (they become unlinked if the draft is deleted on failure). The status flips to 'generated' as the last write.
 */
export async function generateSession(deps: Deps, opts: { light: boolean }, onStage?: OnStage): Promise<GenerateResult> {
  const d = deps.clock.today();
  await cleanupDrafts(deps.db);
  if (await getSessionByDate(deps.db, d)) return { ok: false, message: 'Session exists', code: 'session_exists' };

  let ctx: GenerationContext;
  try {
    ctx = await buildGenerationContext(deps, d, opts.light);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  const settings = await getSettings(deps.db);
  const sessionId = await insertDraftSession(deps.db, {
    date: d, title: title(settings.nativeLanguage, ctx), isLight: opts.light, createdAt: deps.clock.now(),
  });

  try {
    const made = await produce(deps, sessionId, ctx, onStage);
    if (!made.ok) return await fail(deps, sessionId, made.message, made.code);
    const words = await listSpellingWords(deps.db);
    const ids = selectSpellingWords(await getSpellingStates(deps.db), words.map((w) => w.id), d, opts.light);
    const chosen = ids.flatMap((id) => words.find((w) => w.id === id) ?? []);
    await writeBlocks(deps.db, sessionId, settings.nativeLanguage, ctx, made.gen, made.defects, chosen);
    await setSessionStatus(deps.db, sessionId, 'generated');
    return { ok: true, sessionId };
  } catch (e) {
    await deleteSession(deps.db, sessionId);
    throw e;
  }
}

/** Generate → validate → code check, with one retry. The llm_call rows carry `sessionId`. */
export async function produce(
  deps: Deps, sessionId: number, ctx: GenerationContext, onStage?: OnStage,
): Promise<{ ok: true; gen: GeneratedSession; defects: Defects } | { ok: false; message: string; code?: LlmErrorCode }> {
  const base = renderContext(ctx);
  let problems: string[] = [];
  let lastCode: LlmErrorCode | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const prompt = problems.length === 0 ? base : `${base}\n## Problems in the previous attempt (fix them)\n\n${problems.map((p) => `- ${p}`).join('\n')}\n`;
    onStage?.('writing', attempt);
    const gen = await callStructured<GeneratedSession>(deps, 'generate_session', prompt, {
      sessionId,
      maxAttempts: 1,
      check: (s) => violations(s, ctx).join('\n') || null,
    });
    if (!gen.ok) {
      if (FATAL.has(gen.code)) return { ok: false, message: gen.message, code: gen.code };
      problems = [gen.message];
      lastCode = gen.code;
      continue;
    }
    onStage?.('checking', attempt);
    const val = await callStructured<ValidationResult>(deps, 'validate_session', renderValidationInput(gen.data, ctx.allowed), { sessionId, maxAttempts: 1 });
    if (!val.ok) {
      if (FATAL.has(val.code)) return { ok: false, message: val.message, code: val.code };
      problems = [val.message];
      lastCode = val.code;
      continue;
    }
    const { defects, remaining } = applyValidation(gen.data, val.data);
    problems = violations(remaining, ctx);
    lastCode = undefined;
    if (problems.length > 0) continue;
    onStage?.('saving', attempt);
    return { ok: true, gen: gen.data, defects };
  }
  return lastCode === undefined ? { ok: false, message: problems.join('\n') } : { ok: false, message: problems.join('\n'), code: lastCode };
}

async function fail(deps: Deps, sessionId: number, message: string, code?: LlmErrorCode): Promise<GenerateResult> {
  await deleteSession(deps.db, sessionId);
  return code === undefined ? { ok: false, message } : { ok: false, message, code };
}

/** Deletes an ungraded session (rows cascade) and builds a new one for today. */
export async function rebuildSession(deps: Deps, sessionId: number, opts: { light: boolean }, onStage?: OnStage): Promise<GenerateResult> {
  const rows = await deps.db.select<{ status: string; date: string }>('SELECT status, date FROM session WHERE id = ?', [sessionId]);
  const row = rows[0];
  if (!row) throw new Error(`Session ${sessionId} not found`);
  if (row.status === 'graded') throw new Error('Cannot rebuild a graded session');
  if (row.date !== deps.clock.today()) throw new Error("Cannot rebuild a session of another day");
  forgetAwaiting(sessionId);
  await deleteSession(deps.db, sessionId);
  return generateSession(deps, opts, onStage);
}
