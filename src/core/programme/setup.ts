import type { ISODate, Slot, TopicKind } from '@/core/domain';
import type { Db } from '@/core/ports';
import { addDays } from '@/core/dates';

export interface TopicInput { title: string; key: string; kind: TopicKind }
export interface ProgrammeInput {
  title: string;
  startDate: ISODate;
  endDate: ISODate;
  weeks: TopicInput[];
  background: TopicInput[];
  slots: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, Slot>;
}
export interface SeedRule { topicKey: string; body: string; sources: { title: string; url: string }[] }

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

function parseRule(text: string): SeedRule {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') throw new Error('Rule file must start with front matter');
  const end = lines.indexOf('---', 1);
  if (end === -1) throw new Error('Rule front matter is not closed');
  let topicKey = '';
  const sources: SeedRule['sources'] = [];
  for (const line of lines.slice(1, end)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('topic:')) topicKey = trimmed.slice('topic:'.length).trim();
    else if (trimmed.startsWith('- ')) {
      const [title, url] = trimmed.slice(2).split('|').map((s) => s.trim());
      if (!title || !url) throw new Error(`Bad source line: ${trimmed}`);
      sources.push({ title, url });
    }
  }
  if (!topicKey) throw new Error('Rule front matter lacks topic');
  return { topicKey, body: lines.slice(end + 1).join('\n').trim(), sources };
}

export function parseSeed(
  files: { programme: string; rules: Record<string, string> },
  today: ISODate,
): { programme: ProgrammeInput; rules: SeedRule[] } {
  const raw = JSON.parse(files.programme) as {
    title: string;
    weeks: TopicInput[];
    background: TopicInput[];
    slots: Record<string, Slot>;
  };
  // The programme starts today, whatever the weekday: calendar weeks are date-based (see weekNo).
  const startDate = today;
  const slots = {} as Record<1 | 2 | 3 | 4 | 5 | 6 | 7, Slot>;
  for (const wd of WEEKDAYS) {
    const slot = raw.slots[String(wd)];
    if (!slot) throw new Error(`Seed programme lacks slot for weekday ${wd}`);
    slots[wd] = slot;
  }
  const programme: ProgrammeInput = {
    title: raw.title,
    startDate,
    endDate: addDays(startDate, raw.weeks.length * 7 - 1),
    weeks: raw.weeks,
    background: raw.background,
    slots,
  };
  const rules = Object.keys(files.rules).sort().map((name) => parseRule(files.rules[name] as string));
  return { programme, rules };
}

export function loadSeed(today: ISODate): { programme: ProgrammeInput; rules: SeedRule[] } {
  const programmeFiles = import.meta.glob('/seed/programme.json', { query: '?raw', import: 'default', eager: true });
  const ruleFiles = import.meta.glob('/seed/rules/*.md', { query: '?raw', import: 'default', eager: true });
  const programme = Object.values(programmeFiles)[0] as string | undefined;
  if (programme === undefined) throw new Error('Seed files missing');
  return parseSeed({ programme, rules: ruleFiles as Record<string, string> }, today);
}

async function writeSlots(db: Db, slots: ProgrammeInput['slots']): Promise<void> {
  await db.execute('DELETE FROM weekday_slot');
  for (const wd of WEEKDAYS) {
    await db.execute('INSERT INTO weekday_slot (weekday, slot) VALUES (?, ?)', [wd, slots[wd]]);
  }
}

export async function saveProgramme(db: Db, input: ProgrammeInput): Promise<number> {
  const existing = await db.select<{ id: number }>('SELECT id FROM programme LIMIT 1');
  if (existing.length > 0) throw new Error('Programme exists; use replaceProgramme');
  const { lastInsertId: id } = await db.execute(
    'INSERT INTO programme (title, start_date, end_date) VALUES (?, ?, ?)',
    [input.title, input.startDate, input.endDate],
  );
  const all = [...input.weeks.map((t, i) => ({ t, weekNo: i + 1 })), ...input.background.map((t) => ({ t, weekNo: null }))];
  for (const { t, weekNo } of all) {
    await db.execute('INSERT INTO topic (programme_id, key, title, kind, week_no, archived) VALUES (?, ?, ?, ?, ?, 0)', [
      id, t.key, t.title, t.kind, weekNo,
    ]);
  }
  await writeSlots(db, input.slots);
  return id;
}

export async function replaceProgramme(db: Db, input: ProgrammeInput): Promise<void> {
  const existing = await db.select<{ id: number }>('SELECT id FROM programme ORDER BY id LIMIT 1');
  const programmeId = existing[0]?.id;
  if (programmeId === undefined) throw new Error('No programme to replace; use saveProgramme');
  await db.execute('UPDATE programme SET title = ?, start_date = ?, end_date = ? WHERE id = ?', [
    input.title, input.startDate, input.endDate, programmeId,
  ]);
  await writeSlots(db, input.slots);

  // week_no has a partial unique index: clear all before applying new values.
  await db.execute('UPDATE topic SET week_no = NULL');
  const all = [...input.weeks.map((t, i) => ({ t, weekNo: i + 1 })), ...input.background.map((t) => ({ t, weekNo: null }))];
  for (const { t, weekNo } of all) {
    const found = await db.select<{ id: number }>('SELECT id FROM topic WHERE key = ?', [t.key]);
    if (found[0]) {
      await db.execute('UPDATE topic SET title = ?, kind = ?, week_no = ?, archived = 0 WHERE id = ?', [t.title, t.kind, weekNo, found[0].id]);
    } else {
      await db.execute('INSERT INTO topic (programme_id, key, title, kind, week_no, archived) VALUES (?, ?, ?, ?, ?, 0)', [
        programmeId, t.key, t.title, t.kind, weekNo,
      ]);
    }
  }
  const keys = all.map(({ t }) => t.key);
  const marks = keys.map(() => '?').join(', ');
  await db.execute(
    `DELETE FROM topic WHERE key NOT IN (${marks})
       AND id NOT IN (SELECT topic_id FROM item WHERE topic_id IS NOT NULL)
       AND id NOT IN (SELECT topic_id FROM rule)
       AND id NOT IN (SELECT topic_id FROM session_support)`,
    keys,
  );
  // Topics left over are referenced; keep them out of the programme and error-spotting texts.
  await db.execute(`UPDATE topic SET archived = 1 WHERE key NOT IN (${marks})`, keys);
}

export async function insertSeedRules(db: Db, rules: SeedRule[], now: string): Promise<void> {
  for (const r of rules) {
    const topic = await db.select<{ id: number }>('SELECT id FROM topic WHERE key = ?', [r.topicKey]);
    const topicId = topic[0]?.id;
    if (topicId === undefined) continue;
    const has = await db.select<{ id: number }>('SELECT id FROM rule WHERE topic_id = ?', [topicId]);
    if (has.length > 0) continue;
    const { lastInsertId: ruleId } = await db.execute('INSERT INTO rule (topic_id, current_version) VALUES (?, 1)', [topicId]);
    await db.execute(
      'INSERT INTO rule_version (rule_id, version, body, sources, reason, created_at) VALUES (?, 1, ?, ?, ?, ?)',
      [ruleId, r.body, JSON.stringify(r.sources), 'seed', now],
    );
  }
}
