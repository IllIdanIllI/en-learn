import { t, type Lang } from '@/core/i18n';
import type { ProgressLogRow } from '@/core/progress/derive';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/ui/table';

/** One row per graded session, newest first. Numbers are tabular so columns line up. */
export function ProgressLog({ rows, lang }: { rows: ProgressLogRow[]; lang: Lang }) {
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
          <TableRow key={r.sessionId}>
            <TableCell className="tabular whitespace-nowrap text-muted-foreground">{r.date}</TableCell>
            <TableCell>
              {r.title}
              {r.isLight && <span className="label ml-2 text-muted-foreground">{t(lang, 'today.light')}</span>}
              {r.patterns.length > 0 && <p className="label mt-1 font-normal text-muted-foreground">{r.patterns.join(', ')}</p>}
            </TableCell>
            <TableCell className="tabular whitespace-nowrap">
              {r.scores.map((s) => t(lang, 'progress.score', { x: s.correct, y: s.counted })).join(' · ')}
            </TableCell>
            <TableCell className="tabular">{r.errorCount}</TableCell>
            <TableCell className="tabular">{r.disputes}</TableCell>
            <TableCell className="tabular">{r.defects}</TableCell>
            <TableCell className="tabular whitespace-nowrap text-right">${r.costUsd.toFixed(4)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
