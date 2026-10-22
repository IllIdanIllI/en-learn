import type { Db } from '@/core/ports';

export const itemDraftKey = (itemId: number): string => `i:${itemId}`;
export const spotDraftKey = (blockId: number, paragraph: number): string => `p:${blockId}:${paragraph}`;

/** Splits stored drafts into the shape of a submission: item answers by id, spot answers by `${blockId}:${paragraph}`. */
export function draftsToAnswers(drafts: Map<string, string>): { items: Record<number, string>; spot: Record<string, string> } {
  const items: Record<number, string> = {};
  const spot: Record<string, string> = {};
  for (const [key, text] of drafts) {
    if (key.startsWith('i:')) items[Number(key.slice(2))] = text;
    else if (key.startsWith('p:')) spot[key.slice(2)] = text;
  }
  return { items, spot };
}

/** An empty text removes the draft. */
export async function saveDraftAnswer(db: Db, sessionId: number, key: string, text: string): Promise<void> {
  if (text === '') {
    await db.execute('DELETE FROM draft_answer WHERE session_id = ? AND key = ?', [sessionId, key]);
    return;
  }
  await db.execute(
    'INSERT INTO draft_answer (session_id, key, text) VALUES (?, ?, ?) ON CONFLICT(session_id, key) DO UPDATE SET text = excluded.text',
    [sessionId, key, text],
  );
}

export async function loadDraftAnswers(db: Db, sessionId: number): Promise<Map<string, string>> {
  const rows = await db.select<{ key: string; text: string }>(
    'SELECT key, text FROM draft_answer WHERE session_id = ? ORDER BY rowid',
    [sessionId],
  );
  return new Map(rows.map((r) => [r.key, r.text]));
}

export async function deleteDraftAnswers(db: Db, sessionId: number): Promise<void> {
  await db.execute('DELETE FROM draft_answer WHERE session_id = ?', [sessionId]);
}
