import { Link } from 'react-router-dom';
import type { Topic } from '@/core/domain';
import { t, type Lang } from '@/core/i18n';
import type { TopicState } from '@/core/schedule/topics';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/ui/table';

/** Icon plus word: Open is muted, Closed is sage. */
function StatusChip({ closed, lang }: { closed: boolean; lang: Lang }) {
  return (
    <span className={cn('label inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5', closed ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>
      <span aria-hidden>{closed ? '✓' : '○'}</span>
      {t(lang, closed ? 'progress.closed' : 'progress.open')}
    </span>
  );
}

/** Topics that have had a mistake: status, last result from the topic's history, next check dates, link to the rule. */
export function OpenTopics({ topics, states, ruleIds, lang }: {
  topics: Topic[]; states: Map<number, TopicState>; ruleIds: Map<number, number>; lang: Lang;
}) {
  const rows = topics.flatMap((topic) => {
    const state = states.get(topic.id);
    return state && state.status !== 'none' ? [{ topic, state }] : [];
  });
  if (rows.length === 0) return <p className="mt-4 text-muted-foreground">{t(lang, 'progress.topics.empty')}</p>;
  return (
    <Table className="mt-4" aria-label={t(lang, 'progress.topics')}>
      <TableHeader>
        <TableRow>
          <TableHead>{t(lang, 'progress.col.topic')}</TableHead>
          <TableHead>{t(lang, 'progress.col.status')}</TableHead>
          <TableHead>{t(lang, 'progress.col.last')}</TableHead>
          <TableHead>{t(lang, 'progress.col.next')}</TableHead>
          <TableHead>{t(lang, 'progress.col.rule')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ topic, state }) => {
          const last = state.history[state.history.length - 1];
          const ruleId = ruleIds.get(topic.id);
          return (
            <TableRow key={topic.id}>
              <TableCell>{topic.title}</TableCell>
              <TableCell><StatusChip closed={state.status === 'closed'} lang={lang} /></TableCell>
              <TableCell className="tabular text-muted-foreground">{last ? t(lang, `progress.event.${last.event}`, { date: last.date }) : ''}</TableCell>
              <TableCell className="tabular text-muted-foreground">{state.pending.join(', ')}</TableCell>
              <TableCell>
                {ruleId !== undefined && (
                  <Link to={`/rules/${ruleId}`} className="text-primary underline underline-offset-2">{t(lang, 'progress.rule')}</Link>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
