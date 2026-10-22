import type { Deps } from '@/core/ports';
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
import { buildGenerationContext, renderContext, type GenerationContext } from './context';
import { writeBlocks } from './store';
import { applyValidation, renderValidationInput, violations } from './validation';

export { cleanupDrafts };

export type GenerateResult = { ok: true; sessionId: number } | { ok: false; message: string };

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
export async function generateSession(deps: Deps, opts: { light: boolean }): Promise<GenerateResult> {
  const d = deps.clock.today();
  await cleanupDrafts(deps.db);
  if (await getSessionByDate(deps.db, d)) return { ok: false, message: 'Session exists' };

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
    const base = renderContext(ctx);
    let problems: string[] = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const prompt = problems.length === 0 ? base : `${base}\n## Problems in the previous attempt (fix them)\n\n${problems.map((p) => `- ${p}`).join('\n')}\n`;
      const gen = await callStructured<GeneratedSession>(deps, 'generate_session', prompt, {
        sessionId,
        maxAttempts: 1,
        check: (s) => violations(s, ctx).join('\n') || null,
      });
      if (!gen.ok) {
        if (FATAL.has(gen.code)) return await fail(deps, sessionId, gen.message);
        problems = [gen.message];
        continue;
      }
      const val = await callStructured<ValidationResult>(deps, 'validate_session', renderValidationInput(gen.data, ctx.allowed), { sessionId, maxAttempts: 1 });
      if (!val.ok) {
        if (FATAL.has(val.code)) return await fail(deps, sessionId, val.message);
        problems = [val.message];
        continue;
      }
      const { defects, remaining } = applyValidation(gen.data, val.data);
      problems = violations(remaining, ctx);
      if (problems.length > 0) continue;

      const words = await listSpellingWords(deps.db);
      const ids = selectSpellingWords(await getSpellingStates(deps.db), words.map((w) => w.id), d, opts.light);
      const chosen = ids.flatMap((id) => words.find((w) => w.id === id) ?? []);
      await writeBlocks(deps.db, sessionId, settings.nativeLanguage, ctx, gen.data, defects, chosen);
      await setSessionStatus(deps.db, sessionId, 'generated');
      return { ok: true, sessionId };
    }
    return await fail(deps, sessionId, problems.join('\n'));
  } catch (e) {
    await deleteSession(deps.db, sessionId);
    throw e;
  }
}

async function fail(deps: Deps, sessionId: number, message: string): Promise<GenerateResult> {
  await deleteSession(deps.db, sessionId);
  return { ok: false, message };
}

/** Deletes an ungraded session (rows cascade) and builds a new one for today. */
export async function rebuildSession(deps: Deps, sessionId: number, opts: { light: boolean }): Promise<GenerateResult> {
  const rows = await deps.db.select<{ status: string; date: string }>('SELECT status, date FROM session WHERE id = ?', [sessionId]);
  const row = rows[0];
  if (!row) throw new Error(`Session ${sessionId} not found`);
  if (row.status === 'graded') throw new Error('Cannot rebuild a graded session');
  if (row.date !== deps.clock.today()) throw new Error("Cannot rebuild a session of another day");
  await deleteSession(deps.db, sessionId);
  return generateSession(deps, opts);
}
