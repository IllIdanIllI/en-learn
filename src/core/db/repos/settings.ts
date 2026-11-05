import type { Db } from '@/core/ports';
import type { Effort, ISODate, LlmKind } from '@/core/domain';

export interface Settings {
  nativeLanguage: 'ru' | 'en';
  models: Record<LlmKind, string>;
  efforts: Record<LlmKind, Effort>;
  budgetUsd: number | null;
  acceptedShorthands: string[];
  spellingVariant: 'british' | 'american';
  theme: 'dark' | 'light' | 'system';
  design: 'grove' | 'lamp';
  /** Dock icon on macOS while the app runs; the bundled icon is always Light. */
  appIcon: 'light' | 'night';
  /** Ids of sessions the learner closed; the last 30 are kept. */
  closedSessions: number[];
  /** Whole hours 0-12: the app's day starts at this local hour. */
  dayStartHour: number;
  /** Calendar date set by "Start a new day"; null when unset. */
  dayOverride: ISODate | null;
  /** Extra new words the learner added for one date; ignored on other dates. */
  wordsExtraNew: { date: ISODate; extra: number } | null;
}

const DEFAULT_MODEL = 'claude-sonnet-5-5';

export const DEFAULT_SETTINGS: Settings = {
  nativeLanguage: 'ru',
  models: {
    rule_draft: DEFAULT_MODEL,
    rule_chat: DEFAULT_MODEL,
    generate_session: DEFAULT_MODEL,
    validate_session: DEFAULT_MODEL,
    grade: DEFAULT_MODEL,
    dispute: DEFAULT_MODEL,
    explain: DEFAULT_MODEL,
    words: DEFAULT_MODEL,
    word_check: DEFAULT_MODEL,
  },
  efforts: {
    rule_draft: 'medium',
    rule_chat: 'medium',
    generate_session: 'medium',
    validate_session: 'medium',
    grade: 'high',
    dispute: 'medium',
    explain: 'medium',
    words: 'medium',
    word_check: 'medium',
  },
  budgetUsd: null,
  acceptedShorthands: ['✓'],
  spellingVariant: 'british',
  theme: 'dark',
  design: 'grove',
  appIcon: 'light',
  closedSessions: [],
  dayStartHour: 5,
  dayOverride: null,
  wordsExtraNew: null,
};

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.select<{ key: string; value: string }>('SELECT key, value FROM settings');
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const out: Settings = { ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models }, efforts: { ...DEFAULT_SETTINGS.efforts } };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const raw = stored.get(key);
    if (raw === undefined) continue;
    const value: unknown = JSON.parse(raw);
    if (key === 'models') out.models = { ...DEFAULT_SETTINGS.models, ...(value as Partial<Settings['models']>) };
    else if (key === 'efforts') out.efforts = { ...DEFAULT_SETTINGS.efforts, ...(value as Partial<Settings['efforts']>) };
    else (out as unknown as Record<string, unknown>)[key] = value;
  }
  return out;
}

export async function setSetting<K extends keyof Settings>(db: Db, key: K, value: Settings[K]): Promise<void> {
  await db.execute('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
    key,
    JSON.stringify(value),
  ]);
}
