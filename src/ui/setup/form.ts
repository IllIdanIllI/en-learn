import type { ISODate, Programme, Slot, Topic, TopicKind } from '@/core/domain';
import type { MessageKey } from '@/core/i18n';
import { addDays } from '@/core/dates';
import type { ProgrammeInput } from '@/core/programme/setup';

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const SLOTS: Slot[] = ['error_spotting', 'topic', 'second_set', 'speaking', 'writing', 'review_rewrite', 'rest'];

export interface TopicRow {
  uid: string;
  title: string;
  /** Set for topics that already have a key; null means "follow the title". */
  keyOverride: string | null;
  kind: TopicKind;
}

export interface SetupForm {
  title: string;
  startDate: ISODate | '';
  /** Null means "start + weeks x 7 - 1". */
  endOverride: ISODate | null;
  weeks: TopicRow[];
  background: TopicRow[];
  slots: Record<Weekday, Slot | ''>;
}

const KEY_FORMAT = /^[a-z0-9-]+$/;

export function moveRow(rows: TopicRow[], uid: string, delta: -1 | 1): TopicRow[] {
  const i = rows.findIndex((r) => r.uid === uid);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= rows.length) return rows;
  const next = [...rows];
  [next[i], next[j]] = [next[j] as TopicRow, next[i] as TopicRow];
  return next;
}

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export const rowKey = (row: TopicRow): string => row.keyOverride ?? slugify(row.title);

let counter = 0;
export function newRow(kind: TopicKind, title = '', keyOverride: string | null = null): TopicRow {
  counter += 1;
  return { uid: `row-${counter}`, title, keyOverride, kind };
}

export function emptyForm(): SetupForm {
  return {
    title: '',
    startDate: '',
    endOverride: null,
    weeks: [newRow('learn')],
    background: [],
    slots: { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '' },
  };
}

export function defaultEndDate(start: ISODate, weekCount: number): ISODate {
  return addDays(start, Math.max(weekCount, 1) * 7 - 1);
}

export const endDateOf = (f: SetupForm): ISODate | '' =>
  f.endOverride ?? (f.startDate === '' ? '' : defaultEndDate(f.startDate, f.weeks.length));

const fromTopic = (t: { title: string; key: string; kind: TopicKind }): TopicRow => newRow(t.kind, t.title, t.key);

/** Seed input keeps its own end date as an explicit value only when it differs from the default. */
export function formFromInput(input: ProgrammeInput): SetupForm {
  const form: SetupForm = {
    title: input.title,
    startDate: input.startDate,
    endOverride: null,
    weeks: input.weeks.map(fromTopic),
    background: input.background.map(fromTopic),
    slots: { ...input.slots },
  };
  if (input.endDate !== endDateOf(form)) form.endOverride = input.endDate;
  return form;
}

export function formFromStored(
  programme: Programme,
  topics: Topic[],
  slots: Record<number, Slot>,
): SetupForm {
  const live = topics.filter((t) => !t.archived);
  const weeks = live.filter((t) => t.weekNo !== null).sort((a, b) => (a.weekNo ?? 0) - (b.weekNo ?? 0));
  const background = live.filter((t) => t.weekNo === null);
  const stored = (wd: Weekday): Slot | '' => slots[wd] ?? '';
  return formFromInput({
    title: programme.title,
    startDate: programme.startDate,
    endDate: programme.endDate,
    weeks: weeks.map(({ title, key, kind }) => ({ title, key, kind })),
    background: background.map(({ title, key, kind }) => ({ title, key, kind })),
    slots: { 1: stored(1), 2: stored(2), 3: stored(3), 4: stored(4), 5: stored(5), 6: stored(6), 7: stored(7) } as ProgrammeInput['slots'],
  });
}

export interface SetupErrors {
  title?: MessageKey;
  start?: MessageKey;
  end?: MessageKey;
  weeks?: MessageKey;
  slots: Partial<Record<Weekday, MessageKey>>;
  rows: Record<string, { title?: MessageKey; key?: MessageKey }>;
}

export type Validation = { ok: true } | { ok: false; errors: SetupErrors };

export function validate(f: SetupForm): Validation {
  const errors: SetupErrors = { slots: {}, rows: {} };
  if (f.title.trim() === '') errors.title = 'setup.err.title';
  if (f.startDate === '') errors.start = 'setup.err.start';
  const end = endDateOf(f);
  if (f.startDate !== '' && end < f.startDate) errors.end = 'setup.err.endBeforeStart';
  if (f.weeks.length === 0) errors.weeks = 'setup.err.noWeeks';
  for (const wd of WEEKDAYS) if (f.slots[wd] === '') errors.slots[wd] = 'setup.err.slot';

  const seen = new Set<string>();
  for (const row of [...f.weeks, ...f.background]) {
    const rowErrors: { title?: MessageKey; key?: MessageKey } = {};
    if (row.title.trim() === '') rowErrors.title = 'setup.err.topicTitle';
    const key = rowKey(row);
    if (!KEY_FORMAT.test(key)) rowErrors.key = 'setup.err.keyFormat';
    else if (seen.has(key)) rowErrors.key = 'setup.err.keyDuplicate';
    seen.add(key);
    if (rowErrors.title || rowErrors.key) errors.rows[row.uid] = rowErrors;
  }

  const clean = !errors.title && !errors.start && !errors.end && !errors.weeks
    && Object.keys(errors.slots).length === 0 && Object.keys(errors.rows).length === 0;
  return clean ? { ok: true } : { ok: false, errors };
}

/** Only call after `validate` returned ok. */
export function toInput(f: SetupForm): ProgrammeInput {
  const topic = (r: TopicRow) => ({ title: r.title.trim(), key: rowKey(r), kind: r.kind });
  return {
    title: f.title.trim(),
    startDate: f.startDate as ISODate,
    endDate: endDateOf(f) as ISODate,
    weeks: f.weeks.map(topic),
    background: f.background.map(topic),
    slots: f.slots as ProgrammeInput['slots'],
  };
}
