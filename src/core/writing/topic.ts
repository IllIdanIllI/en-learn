import type { Db, Deps } from '@/core/ports';
import { callStructured } from '@/core/llm/call';
import { RECENT_ESSAY_PROMPTS, recentEssayPrompts, setBlockInstruction } from '@/core/db/repos/writing';
import { loadDayInfo } from '@/core/session/plan';

const MIN_CHARS = 40;
const MAX_CHARS = 600;

export interface EssayPromptReply { prompt: string }

/** Lower case, spaces collapsed: the form in which two prompts count as the same. */
const normalise = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** The user prompt of the essay_prompt call. */
export function essayPromptInput(current: string, recent: string[], weekTopic: string | null): string {
  return [
    '## Current prompt (replace it)',
    '',
    current,
    '',
    '## Recent essay prompts (the new prompt must differ in subject from every one)',
    '',
    ...recent.map((p) => `- ${p}`),
    '',
    `## Week's grammar topic: ${weekTopic ?? 'none'}`,
    '',
  ].join('\n');
}

/** null when the reply is usable, else the reason it is not. */
export function checkEssayPrompt(reply: EssayPromptReply, listed: string[]): string | null {
  const prompt = reply.prompt.trim();
  if (prompt.length < MIN_CHARS || prompt.length > MAX_CHARS) return `the prompt must be ${MIN_CHARS} to ${MAX_CHARS} characters`;
  const key = normalise(prompt);
  if (listed.some((p) => normalise(p) === key)) return 'the prompt repeats a recent one';
  return null;
}

/** The block's session date, and its prompt, when the block is an open essay (no text yet); null otherwise. */
async function openEssay(db: Db, blockId: number): Promise<{ sessionId: number; date: string; instruction: string } | null> {
  const rows = await db.select<{ session_id: number; date: string; instruction: string }>(
    `SELECT b.session_id AS session_id, s.date AS date, b.instruction AS instruction
     FROM block b JOIN session s ON s.id = b.session_id
     WHERE b.id = ? AND b.kind = 'writing' AND b.format = 'essay'
       AND NOT EXISTS (SELECT 1 FROM writing_text w WHERE w.block_id = b.id)`,
    [blockId],
  );
  const r = rows[0];
  return r ? { sessionId: r.session_id, date: r.date, instruction: r.instruction } : null;
}

/** The week's grammar topic title of the session's date, or null. */
async function weekTopicTitle(deps: Deps, date: string): Promise<string | null> {
  const info = await loadDayInfo(deps, date);
  if (!info || info.plan.weekNo === null) return null;
  return info.topics.find((t) => t.weekNo === info.plan.weekNo)?.title ?? null;
}

/** Replaces the prompt of an open essay block with a new one; the old prompt stays on any failure. */
export async function newEssayPrompt(
  deps: Deps,
  blockId: number,
): Promise<{ ok: true; prompt: string } | { ok: false; message: string }> {
  const block = await openEssay(deps.db, blockId);
  if (!block) return { ok: false, message: 'The essay is not open' };

  const recent = await recentEssayPrompts(deps.db, RECENT_ESSAY_PROMPTS);
  const listed = recent.some((p) => normalise(p) === normalise(block.instruction)) ? recent : [...recent, block.instruction];
  const weekTopic = await weekTopicTitle(deps, block.date);
  const res = await callStructured<EssayPromptReply>(deps, 'essay_prompt', essayPromptInput(block.instruction, listed, weekTopic), {
    sessionId: block.sessionId,
    check: (r) => checkEssayPrompt(r, listed),
  });
  if (!res.ok) return { ok: false, message: res.message };

  // The essay may have been written while the model answered: then its prompt stays.
  if (!(await openEssay(deps.db, blockId))) return { ok: false, message: 'The essay is not open' };
  const prompt = res.data.prompt.trim();
  await setBlockInstruction(deps.db, blockId, prompt);
  return { ok: true, prompt };
}
