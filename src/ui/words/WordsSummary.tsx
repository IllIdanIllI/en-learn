import { Fragment, useState } from 'react';
import { t, type Lang } from '@/core/i18n';
import { setSetting } from '@/core/db/repos/settings';
import type { WordsOverview } from '@/core/words/practice';
import type { Stage } from '@/core/words/types';
import { useCore } from '@/ui/app/CoreProvider';

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

  const tiles = [
    { label: t(lang, 'words.inProgress'), value: inProgress, tone: 'text-primary' },
    { label: t(lang, 'words.learned'), value: learned, tone: 'text-success' },
    { label: t(lang, 'words.total'), value: total, tone: '' },
  ];

  return (
    <div className="mt-4">
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} data-testid="words-tile" className="rounded-lg bg-card px-4 py-3">
            <div className="label text-muted-foreground">{tile.label}</div>
            <div className={`tabular text-3xl font-bold ${tile.tone}`}>{tile.value}</div>
          </div>
        ))}
      </div>
      <div role="img" aria-label={line} className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-input">
        <div className="h-full bg-success" style={{ width: pct(learned, total) }} />
        <div className="h-full bg-primary" style={{ width: pct(inProgress, total) }} />
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="mt-3 cursor-pointer text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
      >
        {open ? `${t(lang, 'words.hide')} ▴` : `${t(lang, 'words.details')} ▾`}
      </button>
      {open && (
        <dl data-testid="words-details" className="mt-3 grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-1 rounded-md bg-card p-3 text-sm">
          <dt className="text-muted-foreground">{t(lang, 'words.dueLabel')}</dt>
          <dd className="tabular">{dueToday}</dd>
          {STAGES.map((s) => (
            <Fragment key={s}>
              <dt className="text-muted-foreground">{t(lang, `words.stage.${s}`)}</dt>
              <dd className="tabular">{counts[s]}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}
