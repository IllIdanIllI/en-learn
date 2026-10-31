import { describe, expect, test } from 'vitest';
import { createTestDb } from '@/adapters/test/sqliteDb';
import { findOrCreateSpellingWord } from '@/core/db/repos/spelling';
import type { Db } from '@/core/ports';
import { snippetText } from '@/core/progress/errorContext';
import { waitTips, type WaitTip } from '@/core/progress/tips';

async function seedWrongAnswers(db: Db, rows: { text: string; fix: string; expected: string; format: 'gap' | 'spot'; prompt?: string }[]) {
  await db.execute("INSERT INTO programme (title, start_date, end_date) VALUES ('P','2026-10-01','2026-12-01')");
  await db.execute("INSERT INTO topic (programme_id, key, title, kind) VALUES (1,'a','A','learn')");
  await db.execute('INSERT INTO rule (topic_id, current_version) VALUES (1,1)');
  await db.execute("INSERT INTO session (date, title, is_light, status, created_at) VALUES ('2026-10-20','S1',0,'graded','x')");
  await db.execute('INSERT INTO session_support (session_id, topic_id) VALUES (1,1)');
  for (const [i, r] of rows.entries()) {
    await db.execute(
      "INSERT INTO block (session_id, ord, kind, format, title, instruction, minutes) VALUES (1,?,'task',?,'B','i',5)",
      [i + 1, r.format],
    );
    await db.execute(
      "INSERT INTO item (block_id, ord, prompt, expected, topic_id, is_check, status) VALUES (?,1,?,?,1,0,'active')",
      [i + 1, r.prompt ?? 'p', r.expected],
    );
    await db.execute("INSERT INTO answer (item_id, text, verdict, fix, is_inattention) VALUES (?,?,'wrong',?,0)", [i + 1, r.text, r.fix]);
  }
}

describe('waitTips', () => {
  test('is empty for an empty database', async () => {
    const db = await createTestDb();
    expect(await waitTips(db)).toEqual([]);
  });

  test('returns at most limit tips', async () => {
    const db = await createTestDb();
    for (let i = 0; i < 12; i++) {
      const id = await findOrCreateSpellingWord(db, `word${i}`, 'hint', '2026-10-01');
      await db.execute('UPDATE spelling_word SET mnemonic = ? WHERE id = ?', [`mnemonic ${i}`, id]);
    }
    const tips = await waitTips(db);
    expect(tips).toHaveLength(10);
    expect(tips.every((t) => t.kind === 'spelling' && t.word.startsWith('word') && t.mnemonic.startsWith('mnemonic'))).toBe(true);
    expect(await waitTips(db, 3)).toHaveLength(3);
  });

  test('skips spelling words without a mnemonic', async () => {
    const db = await createTestDb();
    await findOrCreateSpellingWord(db, 'receive', 'hint', '2026-10-01');
    expect(await waitTips(db)).toEqual([]);
  });

  test('error-bank tips use the sentence context, never show a tick and drop identical pairs', async () => {
    const db = await createTestDb();
    await seedWrongAnswers(db, [
      { text: 'went', fix: 'goes', expected: 'goes', format: 'gap', prompt: 'He ___ home.' },
      { text: '✓', fix: '✓', expected: 'goes', format: 'gap', prompt: 'She ___ home.' },
      { text: 'went', fix: ' + ', expected: 'goes', format: 'gap', prompt: 'It ___ home.' },
      { text: 'He go home', fix: '', expected: '✓', format: 'spot', prompt: 'He go home' },
      { text: 'x', fix: '', expected: '+', format: 'spot', prompt: 'He goes home' },
    ]);
    const errors = (await waitTips(db)).filter((t): t is Extract<WaitTip, { kind: 'error' }> => t.kind === 'error');
    const tips = errors.map((t) => ({ was: t.was, should: t.should })).sort((a, b) => snippetText(a.was).localeCompare(snippetText(b.was)));
    for (const tip of tips) for (const v of [snippetText(tip.was), snippetText(tip.should)]) expect(['✓', '+', '']).not.toContain(v.trim());
    expect(tips.map((t) => [snippetText(t.was), snippetText(t.should)])).toEqual([
      ['He went home.', 'He goes home.'],
      ['It went home.', 'It goes home.'],
      ['She ___ home.', 'She goes home.'],
    ]);
    expect(tips[0]!.was).toEqual({ before: 'He ', changed: 'went', after: ' home.' });
    expect(tips[0]!.should).toEqual({ before: 'He ', changed: 'goes', after: ' home.' });
  });

  test('keeps spelling mnemonics even when they are a tick', async () => {
    const db = await createTestDb();
    const id = await findOrCreateSpellingWord(db, 'receive', 'hint', '2026-10-01');
    await db.execute("UPDATE spelling_word SET mnemonic = '✓' WHERE id = ?", [id]);
    expect(await waitTips(db)).toEqual([{ kind: 'spelling', word: 'receive', mnemonic: '✓' }]);
  });
});
