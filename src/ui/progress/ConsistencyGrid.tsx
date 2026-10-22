import { t, type Lang } from '@/core/i18n';
import type { Consistency, DayState } from '@/core/progress/derive';
import { cn } from '@/lib/utils';

const CELL: Record<DayState, string> = {
  practised: 'border-transparent bg-success/70',
  light: 'border-transparent bg-success/35',
  none: 'border-border',
  before_start: 'border-border/40',
};

/**
 * The last 100 days as 10 x 10 squares, oldest first. Sage fill for practised days (lighter for light days); days
 * without a session are an outline only, never a warning colour. The state is also in each cell's label.
 */
export function ConsistencyGrid({ data, lang }: { data: Consistency; lang: Lang }) {
  const caption = data.n === 0 ? t(lang, 'progress.noSessions') : t(lang, 'progress.caption', { x: data.practised, n: data.n, y: data.light });
  return (
    <div>
      <div role="img" aria-label={caption} className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(10, 12px)' }}>
        {data.days.map((d) => {
          const label = t(lang, 'progress.day', { date: d.date, state: t(lang, `progress.day.${d.state}`) });
          return (
            <span
              key={d.date}
              aria-hidden
              data-testid="day-cell"
              data-state={d.state}
              title={label}
              className={cn('size-3 rounded-[2px] border', CELL[d.state])}
            />
          );
        })}
      </div>
      <p className="mt-3 text-muted-foreground">{caption}</p>
    </div>
  );
}
