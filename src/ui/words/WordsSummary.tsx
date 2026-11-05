import { useState } from 'react';
import { t, type Lang } from '@/core/i18n';
import { setSetting } from '@/core/db/repos/settings';
import type { WordsOverview } from '@/core/words/practice';
import type { Stage } from '@/core/words/types';
import { useCore } from '@/ui/app/CoreProvider';
import { Button } from '@/ui/components/ui/button';

const STAGES: Stage[] = [1, 2, 3];

/** Share of `total` as a CSS width; 0 for an empty list. */
const pct = (n: number, total: number) => `${total === 0 ? 0 : (n / total) * 100}%`;

export function WordsSummary({ overview, lang }: { overview: WordsOverview; lang: Lang }) {
  const { deps, settings, refresh } = useCore();
  const [open, setOpen] = useState(settings.wordsStatsOpen);
  const { inProgress, learned, total, counts, dueToday } = overview;
  const line = `${t(lang, 'words.inProgress')}: ${inProgress} · ${t(lang, 'words.learned')}: ${learned} · ${t(lang, 'words.total')}: ${total}`;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    try {
      await setSetting(deps.db, 'wordsStatsOpen', next);
      refresh();
    } catch (e) {
      console.error('setting not saved', e);
      setOpen(!next);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm">{line}</span>
        <div role="img" aria-label={line} className="flex h-2 w-40 overflow-hidden rounded-full bg-input">
          <div className="h-full bg-success" style={{ width: pct(learned, total) }} />
          <div className="h-full bg-primary" style={{ width: pct(inProgress, total) }} />
        </div>
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={toggle}>
          {open ? `${t(lang, 'words.hide')} ▴` : `${t(lang, 'words.details')} ▾`}
        </Button>
      </div>
      {open && (
        <ul data-testid="words-details" className="mt-3 flex flex-wrap gap-x-6 gap-y-1 rounded-md bg-card p-3 text-sm">
          <li>
            <span className="text-muted-foreground">{t(lang, 'words.dueLabel')}</span> <span className="tabular">{dueToday}</span>
          </li>
          {STAGES.map((s) => (
            <li key={s}>
              <span className="text-muted-foreground">{t(lang, `words.stage.${s}`)}</span> <span className="tabular">{counts[s]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
