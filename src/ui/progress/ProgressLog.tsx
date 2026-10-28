import { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { t, type Lang } from '@/core/i18n';
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
        <h3 className="font-bold">
          {r.title} <span className="tabular font-normal text-muted-foreground">{r.date}</span>
          {r.isLight && <span className="label ml-2 font-normal text-muted-foreground">{t(lang, 'today.light')}</span>}
        </h3>
        <span className="label tabular whitespace-nowrap text-muted-foreground">${r.costUsd.toFixed(4)}</span>
      </div>
      {counted > 0 && (
        <p data-testid="log-total" className="tabular mt-2 text-lg font-bold">
          {t(lang, 'progress.total', { x: correct, y: counted, p: Math.round((correct * 100) / counted) })}
        </p>
      )}
      {r.scores.length > 0 && (
        <ul data-testid="log-blocks" className="tabular mt-2 flex flex-col gap-0.5">
          {r.scores.map((s) => (
            <li key={s.blockId}>
              {blockTitles.get(s.blockId) ?? ''} — <strong>{t(lang, 'progress.score', { x: s.correct, y: s.counted })}</strong>
            </li>
          ))}
        </ul>
      )}
      <p className="tabular mt-2">
        {t(lang, 'progress.col.errors')}: <strong>{r.errorCount}</strong>
      </p>
      {r.patterns.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
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
  const rows: [string, string][] = [
    [t(lang, 'progress.col.disputes'), String(r.disputes)],
    [t(lang, 'progress.col.defects'), String(r.defects)],
  ];
  if (u.calls > 0) {
    rows.push(
      [t(lang, 'progress.models'), u.models.map((m) => m.replace(/^claude-/, '')).join(', ')],
      [t(lang, 'progress.calls'), `${u.calls}${u.failedCalls > 0 ? ` (${t(lang, 'progress.failed', { n: u.failedCalls })})` : ''}`],
      ...(['input', 'cacheRead', 'cacheWrite', 'output'] as const).map((k): [string, string] => [
        `${t(lang, 'progress.tokens')}: ${t(lang, `progress.tokens.${k}`)}`,
        num.format(u.tokens[k]),
      ]),
    );
  }
  return (
    <table className="tabular w-full max-w-md border-collapse text-sm">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-t border-border first:border-t-0">
            <th scope="row" className="py-1 pr-4 text-left font-normal text-muted-foreground">
              {label}
            </th>
            <td className="py-1 text-right font-bold">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
