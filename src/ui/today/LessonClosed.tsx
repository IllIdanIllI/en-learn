import type { ReactNode } from 'react';
import { t, type Lang } from '@/core/i18n';
import { Button } from '@/ui/components/ui/button';
import { Loader, type LoaderView } from './Loader';

/** Today after the lesson is closed: what the learner can do next. */
export function LessonClosed({ lang, loader, showingResults, onToggleResults, onAddMore, children }: {
  lang: Lang; loader: LoaderView | null; showingResults: boolean; onToggleResults: () => void; onAddMore: () => void;
  /** Extra actions in the card, e.g. solving skipped questions. */
  children?: ReactNode;
}) {
  const adding = loader !== null;
  return (
    <section>
      <h1 className="headline">{t(lang, 'today.closed')}</h1>
      <div className="mt-6 flex items-center gap-3">
        <Button variant="secondary" aria-expanded={showingResults} disabled={adding} onClick={onToggleResults}>
          {t(lang, showingResults ? 'today.hideResults' : 'today.showResults')}
        </Button>
        <Button disabled={adding} onClick={onAddMore}>{t(lang, 'today.addMore')}</Button>
        {children}
      </div>
      {loader !== null && <Loader lang={lang} {...loader} />}
    </section>
  );
}
