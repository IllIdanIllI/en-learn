import type { Db, Deps, LlmResult } from '@/core/ports';
import type { DisputeDecision, ISODate } from '@/core/domain';
import type { DisputeReply, Source } from '@/core/llm/types';
import { callStructured } from '@/core/llm/call';
import { listGradingItems } from '@/core/db/repos/sessions';
import { saveRuleVersion } from '@/core/db/repos/rules';

/** Support (D19): the learner opened the topic's rule before submitting. Ignored unless the session is still generated. */
export async function recordSupport(db: Db, sessionId: number, topicId: number): Promise<void> {
  await db.execute(
    "INSERT OR IGNORE INTO session_support (session_id, topic_id) SELECT id, ? FROM session WHERE id = ? AND status = 'generated'",
    [topicId, sessionId],
  );
}

/** Asks for the app's position on a wrong or rule_gap item. Saves the objection first, then the reply on success. */
export async function disputeItem(deps: Deps, itemId: number, text: string): Promise<LlmResult<DisputeReply>> {
  const rows = await deps.db.select<{
    session_id: number; text: string; verdict: string; fix: string | null; explanation: string | null; rule_section: string | null;
  }>(
    `SELECT b.session_id AS session_id, a.text AS text, a.verdict AS verdict, a.fix AS fix,
            a.explanation AS explanation, a.rule_section AS rule_section
     FROM answer a JOIN item i ON i.id = a.item_id JOIN block b ON b.id = i.block_id
     WHERE a.item_id = ?`,
    [itemId],
  );
  const answer = rows[0];
  if (!answer || (answer.verdict !== 'wrong' && answer.verdict !== 'rule_gap')) throw new Error('dispute not allowed');
  const item = (await listGradingItems(deps.db, answer.session_id)).find((i) => i.id === itemId);
  if (!item) throw new Error('Item not found');

  await deps.db.execute('UPDATE answer SET dispute_text = ? WHERE item_id = ?', [text, itemId]);
  const message = [
    `Topic key: ${item.topicKey ?? '(none)'}`,
    `Prompt: ${item.prompt}`,
    `Expected answer: ${item.expected}`,
    `Learner answer: ${answer.text}`,
    `Grade verdict: ${answer.verdict}`,
    `Grade fix: ${answer.fix ?? '(none)'}`,
    `Grade explanation: ${answer.explanation ?? '(none)'}`,
    `Rule section: ${answer.rule_section || item.ruleSection || '(none)'}`,
    `Rule body (version ${item.ruleVersion ?? '-'}):`,
    item.ruleBody ?? '(none)',
    "Learner's objection:",
    text,
  ].join('\n');

  const res = await callStructured<DisputeReply>(deps, 'dispute', message, { sessionId: answer.session_id });
  if (res.ok) {
    await deps.db.execute('UPDATE answer SET dispute_reply = ? WHERE item_id = ?', [JSON.stringify(res.data), itemId]);
  }
  return res;
}

/** The learner's choice after a dispute (keep / correct / drop). Everything derived recomputes from it. */
export async function decideDispute(db: Db, itemId: number, decision: DisputeDecision): Promise<void> {
  const rows = await db.select<{ dispute_text: string | null }>('SELECT dispute_text FROM answer WHERE item_id = ?', [itemId]);
  if (!rows[0]?.dispute_text) throw new Error('No dispute to decide');
  await db.execute('UPDATE answer SET dispute_decision = ? WHERE item_id = ?', [decision, itemId]);
}

/** Inattention tag (FR-25) on a wrong item. */
export async function setInattention(db: Db, itemId: number, value: boolean): Promise<void> {
  const rows = await db.select<{ verdict: string }>('SELECT verdict FROM answer WHERE item_id = ?', [itemId]);
  if (rows[0]?.verdict !== 'wrong') throw new Error('inattention not allowed');
  await db.execute('UPDATE answer SET is_inattention = ? WHERE item_id = ?', [value ? 1 : 0, itemId]);
}

/** Approve writes the proposal as a new rule version (reason 'rule gap'); reject leaves the rule unchanged. */
export async function decideRuleGap(db: Db, gapId: number, approve: boolean, now: ISODate): Promise<void> {
  const rows = await db.select<{ rule_id: number; proposal: string; sources: string; status: string }>(
    'SELECT rule_id, proposal, sources, status FROM rule_gap WHERE id = ?',
    [gapId],
  );
  const gap = rows[0];
  if (!gap) throw new Error('Rule gap not found');
  if (gap.status !== 'pending') throw new Error('Rule gap already decided');
  if (approve) {
    await saveRuleVersion(db, { ruleId: gap.rule_id }, gap.proposal, JSON.parse(gap.sources) as Source[], 'rule gap', now);
  }
  await db.execute('UPDATE rule_gap SET status = ? WHERE id = ?', [approve ? 'approved' : 'rejected', gapId]);
}

/** Empty or blank text clears the mnemonic. */
export async function saveMnemonic(db: Db, wordId: number, text: string): Promise<void> {
  const trimmed = text.trim();
  await db.execute('UPDATE spelling_word SET mnemonic = ? WHERE id = ?', [trimmed === '' ? null : trimmed, wordId]);
}
