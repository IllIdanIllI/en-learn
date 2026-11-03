import { useEffect, useState, type ReactNode } from 'react';
import { t, type Lang } from '@/core/i18n';
import { extendOptions, type ExtendOptions } from '@/core/session/choice';
import { useCore } from '@/ui/app/CoreProvider';
import { Button } from '@/ui/components/ui/button';
import { ErrorNotice } from './ErrorNotice';
import { AddRoundCards, type AddRound } from './LessonCards';
import { Loader, type LoaderView } from './Loader';

/** Today after the lesson is closed: what the learner can do next. */
export function LessonClosed({ lang, sessionId, loader, showingResults, onToggleResults, onAdd, children }: {
  lang: Lang; sessionId: number; loader: LoaderView | null; showingResults: boolean; onToggleResults: () => void; onAdd: (round: AddRound) => void;
  /** Extra actions in the card, e.g. solving skipped questions. */
  children?: ReactNode;
}) {
  const { deps } = useCore();
  const adding = loader !== null;
  // The panel of the added round: its cards and default ticks are read when it opens; "Добавить" starts the round with the ticked cards.
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ExtendOptions | null>(null);
  const [chosen, setChosen] = useState<AddRound>({ formats: [], writing: false });
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!open) return;
    let live = true;
    extendOptions(deps, sessionId).then(
      (o) => {
        if (!live) return;
        setOptions(o);
        setChosen({ formats: o.defaults, writing: false });
      },
      (e: unknown) => {
        if (live) setOptionsError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      live = false;
    };
  }, [deps, sessionId, open, reload]);

  const close = () => {
    setOpen(false);
    setOptions(null);
    setOptionsError(null);
  };
  return (
    <section>
      <h1 className="headline">{t(lang, 'today.closed')}</h1>
      <div className="mt-6 flex items-center gap-3">
        <Button variant="secondary" aria-expanded={showingResults} disabled={adding} onClick={onToggleResults}>
          {t(lang, showingResults ? 'today.hideResults' : 'today.showResults')}
        </Button>
        <Button aria-expanded={open} disabled={adding} onClick={() => (open ? close() : setOpen(true))}>{t(lang, 'today.addMore')}</Button>
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
          <div className="mt-4">
            <Button disabled={options === null || (chosen.formats.length === 0 && !chosen.writing) || adding} onClick={() => { onAdd(chosen); close(); }}>
              {t(lang, 'picker.add')}
            </Button>
          </div>
        </div>
      )}
      {loader !== null && <Loader lang={lang} {...loader} />}
    </section>
  );
}
