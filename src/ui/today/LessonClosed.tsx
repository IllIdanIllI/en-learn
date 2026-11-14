import { useEffect, useState, type ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { t, type Lang } from '@/core/i18n';
import { extendOptions, type AddRound, type ExtendOptions } from '@/core/session/choice';
import { useCore } from '@/ui/app/CoreProvider';
import { Button } from '@/ui/components/ui/button';
import { ErrorNotice } from './ErrorNotice';
import { AddRoundCards } from './LessonCards';
import { Loader, type LoaderView } from './Loader';

const NONE: AddRound = { review: false, formats: [], spelling: false, writing: false, rewrite: false };

/** Today after the lesson is closed: what the learner can do next. */
export function LessonClosed({ lang, sessionId, loader, showingResults, onToggleResults, onAdd, afterHeader, children }: {
  lang: Lang; sessionId: number; loader: LoaderView | null; showingResults: boolean; onToggleResults: () => void; onAdd: (round: AddRound) => void;
  /** Extra actions in the card, e.g. solving skipped questions. */
  /** Rendered right under the heading. */
  afterHeader?: ReactNode;
  children?: ReactNode;
}) {
  const { deps } = useCore();
  const adding = loader !== null;
  // The panel of the added round sits behind the gear: its cards and default ticks are read when it opens; the main button starts the round with the ticked cards.
  // Without the panel the choice is empty, and Today adds the round with the defaults.
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ExtendOptions | null>(null);
  const [chosen, setChosen] = useState<AddRound>(NONE);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!open) return;
    let live = true;
    extendOptions(deps, sessionId).then(
      (o) => {
        if (!live) return;
        setOptions(o);
        setChosen({ ...NONE, formats: o.defaults });
      },
      (e: unknown) => {
        if (live) setOptionsError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      live = false;
    };
  }, [deps, sessionId, open, reload]);

  // Like Start: with the panel open and every card unpressed there is nothing to add. Untouched (closed) panel adds the defaults.
  const noneTicked = open && options !== null && !chosen.review && chosen.formats.length === 0 && !chosen.spelling && !chosen.writing && !chosen.rewrite;
  const close = () => {
    setOpen(false);
    setOptions(null);
    setChosen(NONE);
    setOptionsError(null);
  };
  return (
    <section>
      <h1 className="headline">{t(lang, 'today.closed')}</h1>
      {afterHeader}
      <div className="mt-6 flex items-center gap-3">
        <Button variant="secondary" aria-expanded={showingResults} disabled={adding} onClick={onToggleResults}>
          {t(lang, showingResults ? 'today.hideResults' : 'today.showResults')}
        </Button>
        <div className="inline-flex">
          <Button className="rounded-r-none" disabled={adding || noneTicked} onClick={() => { onAdd(chosen); close(); }}>{t(lang, 'today.addMore')}</Button>
          <Button
            className="rounded-l-none border-l border-primary-foreground/30 px-2.5"
            aria-label={t(lang, 'today.setup')}
            aria-expanded={open}
            disabled={adding}
            onClick={() => (open ? close() : setOpen(true))}
          >
            <Settings strokeWidth={1.5} aria-hidden />
          </Button>
        </div>
        {children}
      </div>
      {open && (
        <div className="mt-6 flex flex-col gap-3">
          {optionsError !== null && (
            <ErrorNotice
              kind="gen"
              message={optionsError}
              busy={adding}
              onRetry={() => {
                setOptionsError(null);
                setReload((n) => n + 1);
              }}
            />
          )}
          {options !== null && <AddRoundCards lang={lang} options={options} value={chosen} disabled={adding} onChange={setChosen} />}
        </div>
      )}
      {loader !== null && <Loader lang={lang} {...loader} />}
    </section>
  );
}
