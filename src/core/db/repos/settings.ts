import type { Db } from '@/core/ports';
import type { LlmKind } from '@/core/domain';

export interface Settings {
  nativeLanguage: 'ru' | 'en';
  models: Record<LlmKind, string>;
  budgetUsd: number | null;
  acceptedShorthands: string[];
  spellingVariant: 'british' | 'american';
  theme: 'dark' | 'light' | 'system';
  /** Ids of sessions the learner closed; the last 30 are kept. */
  closedSessions: number[];
}

const DEFAULT_MODEL = 'claude-sonnet-5-5';

export const DEFAULT_SETTINGS: Settings = {
  nativeLanguage: 'ru',
  models: {
    rule_draft: DEFAULT_MODEL,
    generate_session: DEFAULT_MODEL,
    validate_session: DEFAULT_MODEL,
    grade: DEFAULT_MODEL,
    dispute: DEFAULT_MODEL,
  },
  budgetUsd: null,
  acceptedShorthands: ['✓'],
  spellingVariant: 'british',
  theme: 'dark',
  closedSessions: [],
};

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.select<{ key: string; value: string }>('SELECT key, value FROM settings');
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const out: Settings = { ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models } };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const raw = stored.get(key);
    if (raw === undefined) continue;
    const value: unknown = JSON.parse(raw);
    if (key === 'models') out.models = { ...DEFAULT_SETTINGS.models, ...(value as Partial<Settings['models']>) };
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
