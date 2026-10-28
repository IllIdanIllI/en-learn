import { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { pluralForm, t, type Lang } from '@/core/i18n';
import type { ProgressLogRow } from '@/core/progress/derive';
import { Button } from '@/ui/components/ui/button';

/** One card per graded session, newest first. Numbers are tabular so they line up. */
export function ProgressLog({ rows, blockTitles, lang }: { rows: ProgressLogRow[]; blockTitles: Map<number, string>; lang: Lang }) {
  if (rows.length === 0) return <p className="mt-4 text-muted-foreground">{t(lang, 'progress.log.empty')}</p>;
  return (
    <ul className="mt-4 flex flex-col gap-3" aria-label={t(lang, 'progress.log')}>
      {rows.map((r) => (
        <LogCard key={r.sessionId} r={r} blockTitles={blockTitles} lang={lang} />
      ))}
    </ul>
  );
}

function LogCard({ r, blockTitles, lang }: { r: ProgressLogRow; blockTitles: Map<number, string>; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const correct = r.scores.reduce((n, s) => n + s.correct, 0);
  const counted = r.scores.reduce((n, s) => n + s.counted, 0);
  return (
    <li className="rounded-md border border-border bg-card px-4 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-medium">
          <span className="tabular text-muted-foreground">{r.date}</span> · {r.title}
          {r.isLight && <span className="label ml-2 text-muted-foreground">{t(lang, 'today.light')}</span>}
        </h3>
        <span className="label tabular whitespace-nowrap text-muted-foreground">${r.costUsd.toFixed(4)}</span>
      </div>
      {counted > 0 && (
        <p className="tabular mt-2 text-lg font-medium">
          {t(lang, 'progress.total', { x: correct, y: counted, p: Math.round((correct * 100) / counted) })}
        </p>
      )}
      <p className="label tabular mt-1 font-normal text-muted-foreground">
        {r.scores.map((s) => `${blockTitles.get(s.blockId) ?? ''} ${t(lang, 'progress.score', { x: s.correct, y: s.counted })}`.trim()).join(' · ')}
      </p>
      <p className="label tabular mt-1 font-normal text-muted-foreground">
        {t(lang, 'progress.col.errors')}: {r.errorCount}
      </p>
      {r.patterns.length > 0 && (
        <ul className="label mt-2 font-normal text-muted-foreground">
          {r.patterns.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 mt-2"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t(lang, 'progress.details')}
        <ChevronDownIcon className={open ? 'rotate-180' : ''} aria-hidden="true" />
      </Button>
      {open && (
        <div data-testid="log-details" className="mt-1">
          <Details r={r} lang={lang} />
        </div>
      )}
    </li>
  );
}

function Details({ r, lang }: { r: ProgressLogRow; lang: Lang }) {
  const u = r.usage;
  const num = new Intl.NumberFormat(lang);
  const form = pluralForm(lang, u.calls);
  const callsKey = form === 'one' || form === 'few' || form === 'many' ? (`progress.calls.${form}` as const) : 'progress.calls.other';
  const calls = t(lang, callsKey, { n: u.calls });
  const tokens = (['input', 'cacheRead', 'cacheWrite', 'output'] as const)
    .map((k) => `${num.format(u.tokens[k])} ${t(lang, `progress.tokens.${k}`)}`)
    .join(' · ');
  return (
    <p className="label tabular font-normal text-muted-foreground">
      {t(lang, 'progress.col.disputes')}: {r.disputes} · {t(lang, 'progress.col.defects')}: {r.defects}
      {u.calls > 0 && ` · ${t(lang, 'progress.models')}: ${u.models.map((m) => m.replace(/^claude-/, '')).join(', ')} · ${calls}${u.failedCalls > 0 ? ` (${t(lang, 'progress.failed', { n: u.failedCalls })})` : ''} · ${tokens}`}
    </p>
  );
}
