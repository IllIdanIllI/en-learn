import { t, type Lang } from '@/core/i18n';
import { Button } from '@/ui/components/ui/button';
import { Skeleton } from './StartSession';

/** Today after the lesson is closed: what the learner can do next. */
export function LessonClosed({ lang, adding, showingResults, onToggleResults, onAddMore }: {
  lang: Lang; adding: boolean; showingResults: boolean; onToggleResults: () => void; onAddMore: () => void;
}) {
  return (
    <section>
      <h1 className="headline">{t(lang, 'today.closed')}</h1>
      <div className="mt-6 flex items-center gap-3">
        <Button variant="secondary" aria-expanded={showingResults} disabled={adding} onClick={onToggleResults}>
          {t(lang, 'today.showResults')}
        </Button>
        <Button disabled={adding} onClick={onAddMore}>{t(lang, 'today.addMore')}</Button>
      </div>
      <div role="status">
        {adding && (
          <>
            <Skeleton />
            <p className="mt-4 text-muted-foreground">{t(lang, 'today.addingMore')}</p>
          </>
        )}
      </div>
    </section>
  );
}
