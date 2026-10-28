import { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { pluralForm, t, type Lang } from '@/core/i18n';
import type { ProgressLogRow } from '@/core/progress/derive';
import { Button } from '@/ui/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/ui/table';

/** One row per graded session, newest first. Numbers are tabular so columns line up. */
export function ProgressLog({ rows, blockTitles, lang }: { rows: ProgressLogRow[]; blockTitles: Map<number, string>; lang: Lang }) {
  if (rows.length === 0) return <p className="mt-4 text-muted-foreground">{t(lang, 'progress.log.empty')}</p>;
  return (
    <Table className="mt-4" aria-label={t(lang, 'progress.log')}>
      <TableHeader>
        <TableRow>
          <TableHead>{t(lang, 'progress.col.date')}</TableHead>
          <TableHead>{t(lang, 'progress.col.session')}</TableHead>
          <TableHead>{t(lang, 'progress.col.scores')}</TableHead>
          <TableHead>{t(lang, 'progress.col.errors')}</TableHead>
          <TableHead>{t(lang, 'progress.col.disputes')}</TableHead>
          <TableHead>{t(lang, 'progress.col.defects')}</TableHead>
          <TableHead className="whitespace-nowrap text-right">{t(lang, 'progress.col.cost')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <LogRow key={r.sessionId} r={r} blockTitles={blockTitles} lang={lang} />
        ))}
      </TableBody>
    </Table>
  );
}

function LogRow({ r, blockTitles, lang }: { r: ProgressLogRow; blockTitles: Map<number, string>; lang: Lang }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow>
        <TableCell className="tabular whitespace-nowrap text-muted-foreground">{r.date}</TableCell>
        <TableCell>
          {r.title}
          {r.isLight && <span className="label ml-2 text-muted-foreground">{t(lang, 'today.light')}</span>}
          {r.patterns.length > 0 && <p className="label mt-1 font-normal text-muted-foreground">{r.patterns.join(', ')}</p>}
        </TableCell>
        <TableCell className="tabular">
          {r.scores.map((s) => `${blockTitles.get(s.blockId) ?? ''} ${t(lang, 'progress.score', { x: s.correct, y: s.counted })}`.trim()).join(' · ')}
        </TableCell>
        <TableCell className="tabular">{r.errorCount}</TableCell>
        <TableCell className="tabular">{r.disputes}</TableCell>
        <TableCell className="tabular">{r.defects}</TableCell>
        <TableCell className="tabular whitespace-nowrap text-right">
          ${r.costUsd.toFixed(4)}
          {r.usage.calls > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="ml-1 size-6 align-middle"
              aria-expanded={open}
              aria-label={t(lang, 'progress.details')}
              onClick={() => setOpen(!open)}
            >
              <ChevronDownIcon className={open ? 'rotate-180' : ''} aria-hidden="true" />
            </Button>
          )}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow data-testid="log-details">
          <TableCell colSpan={7}>
            <Details r={r} lang={lang} />
          </TableCell>
        </TableRow>
      )}
    </>
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
      {t(lang, 'progress.models')}: {u.models.map((m) => m.replace(/^claude-/, '')).join(', ')} · {calls}
      {u.failedCalls > 0 && ` (${t(lang, 'progress.failed', { n: u.failedCalls })})`} · {tokens}
    </p>
  );
}
