import type {
  BlockFormat, BlockKind, DisputeDecision, EffectiveVerdict, GapStatus, ISODate, ItemStatus, SessionStatus, Verdict,
} from '@/core/domain';
import type { Db } from '@/core/ports';
import { effectiveVerdict } from '@/core/verdict';
import { blockScores } from '@/core/progress/derive';

export interface ViewAnswer {
  text: string;
  verdict: Verdict;
  fix: string;
  explanation: string;
  vocabularyNote: string;
  ruleSection: string;
  isInattention: boolean;
  disputeText: string | null;
  disputeReply: string | null;
  disputeDecision: DisputeDecision | null;
}

export interface ViewItem {
  id: number;
  ord: number;
  prompt: string;
  format: BlockFormat;
  topicId: number | null;
  ruleId: number | null;
  ruleSection: string | null;
  status: ItemStatus;
  /** Graded sessions only: the answer key and everything derived from the answer. */
  expected?: string;
  note?: string | null;
  answer?: ViewAnswer | null;
  effective?: EffectiveVerdict;
  gap?: { id: number; status: GapStatus; proposal: string } | null;
  /** Graded spelling items: the word's id and the learner's saved mnemonic. */
  spellingWordId?: number | null;
  mnemonic?: string | null;
}

export interface ViewParagraph {
  index: number;
  text: string;
  /** Graded sessions only. */
  learnerText?: string;
  errors?: ViewItem[];
  extra?: { text: string; explanation: string }[];
}

export interface ViewBlock {
  id: number;
  ord: number;
  kind: BlockKind;
  format: BlockFormat;
  title: string;
  instruction: string;
  formatExample: string | null;
  minutes: number;
  /** Speaking blocks: the question to answer aloud. */
  question?: string;
  /** Spot blocks keep their hidden errors under `paragraphs`, and only once graded. */
  items: ViewItem[];
  paragraphs: ViewParagraph[];
  score?: { correct: number; counted: number };
}

export interface SessionView {
  id: number;
  date: ISODate;
  title: string;
  isLight: boolean;
  status: SessionStatus;
  totalMinutes: number;
  /** First rule section of the task block and the 1-based number of that block. */
  readFirst: { section: string; blockNumber: number; ruleId: number | null; topicId: number | null } | null;
  blocks: ViewBlock[];
  feedback?: { patterns: string[]; tomorrow: string[] };
}

interface ItemRow {
  id: number; block_id: number; ord: number; prompt: string; expected: string; paragraph: number | null;
  topic_id: number | null; rule_id: number | null; rule_section: string | null; status: ItemStatus; note: string | null;
  a_text: string | null; a_verdict: Verdict | null; a_fix: string | null; a_rule_section: string | null;
  a_explanation: string | null; a_vocabulary_note: string | null; a_is_inattention: number | null;
  a_dispute_text: string | null; a_dispute_reply: string | null; a_dispute_decision: DisputeDecision | null;
  has_answer: number | null; spelling_word_id: number | null; mnemonic: string | null; gap_id: number | null; gap_status: GapStatus | null; gap_proposal: string | null;
}

/**
 * Everything the Today page shows. The answer key (`expected`, defect notes, spot errors) is added only when the
 * session is graded, so it cannot reach the DOM before then (FR-10).
 */
export async function loadSessionView(db: Db, sessionId: number): Promise<SessionView> {
  const sessions = await db.select<{ id: number; date: string; title: string; is_light: number; status: SessionStatus }>(
    'SELECT id, date, title, is_light, status FROM session WHERE id = ?', [sessionId],
  );
  const s = sessions[0];
  if (!s) throw new Error(`Session ${sessionId} not found`);
  const graded = s.status === 'graded';

  const blockRows = await db.select<{
    id: number; ord: number; kind: BlockKind; format: BlockFormat; title: string; instruction: string;
    format_example: string | null; passage: string | null; minutes: number;
  }>('SELECT id, ord, kind, format, title, instruction, format_example, passage, minutes FROM block WHERE session_id = ? ORDER BY ord', [sessionId]);

  const itemRows = await db.select<ItemRow>(
    `SELECT i.id AS id, i.block_id AS block_id, i.ord AS ord, i.prompt AS prompt, i.expected AS expected, i.paragraph AS paragraph,
            i.topic_id AS topic_id, i.rule_id AS rule_id, i.rule_section AS rule_section, i.status AS status, i.note AS note,
            a.text AS a_text, a.verdict AS a_verdict, a.fix AS a_fix, a.rule_section AS a_rule_section,
            a.explanation AS a_explanation, a.vocabulary_note AS a_vocabulary_note, a.is_inattention AS a_is_inattention,
            a.dispute_text AS a_dispute_text, a.dispute_reply AS a_dispute_reply, a.dispute_decision AS a_dispute_decision,
            a.item_id AS has_answer, i.spelling_word_id AS spelling_word_id, w.mnemonic AS mnemonic, g.id AS gap_id, g.status AS gap_status, g.proposal AS gap_proposal
     FROM item i JOIN block b ON b.id = i.block_id
     LEFT JOIN answer a ON a.item_id = i.id LEFT JOIN rule_gap g ON g.item_id = i.id
     LEFT JOIN spelling_word w ON w.id = i.spelling_word_id
     WHERE b.session_id = ? ORDER BY b.ord, i.ord`,
    [sessionId],
  );

  const spotTexts = new Map<string, string>();
  const extras = new Map<string, { text: string; explanation: string }[]>();
  let feedback: SessionView['feedback'];
  if (graded) {
    const spots = await db.select<{ block_id: number; paragraph: number; text: string }>(
      'SELECT sa.block_id AS block_id, sa.paragraph AS paragraph, sa.text AS text FROM spot_answer sa JOIN block b ON b.id = sa.block_id WHERE b.session_id = ?',
      [sessionId],
    );
    for (const r of spots) spotTexts.set(`${r.block_id}:${r.paragraph}`, r.text);
    const found = await db.select<{ block_id: number; paragraph: number; text: string; explanation: string }>(
      'SELECT e.block_id AS block_id, e.paragraph AS paragraph, e.text AS text, e.explanation AS explanation FROM extra_finding e JOIN block b ON b.id = e.block_id WHERE b.session_id = ? ORDER BY e.rowid',
      [sessionId],
    );
    for (const r of found) {
      const key = `${r.block_id}:${r.paragraph}`;
      extras.set(key, [...(extras.get(key) ?? []), { text: r.text, explanation: r.explanation }]);
    }
    const fb = await db.select<{ patterns: string; tomorrow: string }>('SELECT patterns, tomorrow FROM session_feedback WHERE session_id = ?', [sessionId]);
    feedback = { patterns: fb[0] ? (JSON.parse(fb[0].patterns) as string[]) : [], tomorrow: fb[0] ? (JSON.parse(fb[0].tomorrow) as string[]) : [] };
  }

  const toItem = (r: ItemRow, format: BlockFormat): ViewItem => {
    const item: ViewItem = {
      id: r.id, ord: r.ord, prompt: r.prompt, format, topicId: r.topic_id, ruleId: r.rule_id, ruleSection: r.rule_section, status: r.status,
    };
    if (!graded) return item;
    const answer: ViewAnswer | null = r.has_answer === null ? null : {
      text: r.a_text ?? '', verdict: r.a_verdict ?? 'skipped', fix: r.a_fix ?? '', explanation: r.a_explanation ?? '',
      vocabularyNote: r.a_vocabulary_note ?? '', ruleSection: r.a_rule_section ?? '', isInattention: r.a_is_inattention === 1,
      disputeText: r.a_dispute_text, disputeReply: r.a_dispute_reply, disputeDecision: r.a_dispute_decision,
    };
    return {
      ...item,
      expected: r.expected,
      note: r.note,
      answer,
      effective: effectiveVerdict({
        itemStatus: r.status, verdict: answer?.verdict ?? 'skipped', disputeDecision: answer?.disputeDecision ?? null, gapStatus: r.gap_status,
      }),
      spellingWordId: r.spelling_word_id,
      mnemonic: r.mnemonic,
      gap: r.gap_id === null ? null : { id: r.gap_id, status: r.gap_status ?? 'pending', proposal: r.gap_proposal ?? '' },
    };
  };

  const blocks: ViewBlock[] = blockRows.map((b) => {
    const rows = itemRows.filter((r) => r.block_id === b.id);
    const isSpot = b.format === 'spot';
    const visible = rows.filter((r) => graded || r.status !== 'defect');
    const isQuestion = b.format === 'question';
    const passage = b.passage === null || isQuestion ? [] : (JSON.parse(b.passage) as string[]);
    return {
      id: b.id, ord: b.ord, kind: b.kind, format: b.format, title: b.title, instruction: b.instruction,
      formatExample: b.format_example, minutes: b.minutes,
      ...(isQuestion ? { question: b.passage ?? '' } : {}),
      items: isSpot ? [] : visible.map((r) => toItem(r, b.format)),
      paragraphs: passage.map((text, index): ViewParagraph => {
        if (!graded) return { index, text };
        const key = `${b.id}:${index}`;
        return {
          index, text, learnerText: spotTexts.get(key) ?? '',
          errors: visible.filter((r) => r.paragraph === index).map((r) => toItem(r, b.format)),
          extra: extras.get(key) ?? [],
        };
      }),
    };
  });

  if (graded) {
    const scored = blocks.flatMap((b) =>
      [...b.items, ...b.paragraphs.flatMap((p) => p.errors ?? [])].map((i) => ({
        blockId: b.id, blockKind: b.kind, format: b.format, verdict: i.effective ?? null,
      })),
    );
    const scores = new Map(blockScores(scored).map((x) => [x.blockId, x]));
    for (const b of blocks) {
      const x = scores.get(b.id);
      if (x) b.score = { correct: x.correct, counted: x.counted };
    }
  }

  const task = blocks.findIndex((b) => b.kind === 'task');
  const first = task < 0 ? undefined : itemRows.find((r) => r.block_id === blocks[task]!.id && r.status === 'active' && r.rule_section);
  const section = first?.rule_section;

  return {
    id: s.id, date: s.date, title: s.title, isLight: s.is_light === 1, status: s.status,
    totalMinutes: blocks.reduce((sum, b) => sum + b.minutes, 0),
    readFirst: section ? { section, blockNumber: task + 1, ruleId: first.rule_id, topicId: first.topic_id } : null,
    blocks,
    ...(feedback ? { feedback } : {}),
  };
}
