import { useEffect, useState } from 'react';
import type { ISODate } from '@/core/domain';
import { t, type Lang } from '@/core/i18n';
import { lessonOptions, type LessonChoice, type LessonOptions } from '@/core/session/choice';
import { useCore } from '@/ui/app/CoreProvider';
import { Button } from '@/ui/components/ui/button';
import { Toggle } from '@/ui/components/ui/toggle';
import { ErrorNotice } from './ErrorNotice';
import { LessonPicker } from './LessonPicker';
import { Loader, type LoaderView } from './Loader';

export type GenError = { message: string; code?: string };

/** Empty state with the lesson picker and the primary action, and the loading and error states of generation. */
export function StartSession({ lang, today, loader, error, rest = false, onStart }: {
  lang: Lang; today: ISODate; loader: LoaderView | null; error: GenError | null; rest?: boolean; onStart: (light: boolean, choice: LessonChoice) => void;
}) {
  const { deps } = useCore();
  const [lightChoice, setLight] = useState(false);
  // The picker's rows and defaults come from the day's programme; until they are loaded the button stays disabled.
  const [options, setOptions] = useState<LessonOptions | null>(null);
  const [choice, setChoice] = useState<LessonChoice | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    lessonOptions(deps, today, rest).then(
      (o) => {
        if (!live) return;
        setOptions(o);
        setChoice(o.defaults);
      },
      (e: unknown) => {
        if (live) setOptionsError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      live = false;
    };
  }, [deps, today, rest, reload]);

  const generating = loader !== null;
  // A rest day has no toggle: the only way to practise is a light day.
  const light = rest || lightChoice;
  const ready = choice !== null && (choice.review || choice.formats.length > 0 || choice.spelling || choice.speaking);
  const start = () => {
    if (choice !== null) onStart(light, choice);
  };
  return (
    <>
      {error !== null && (
        <ErrorNotice kind="gen" className="mt-6" message={error.message} code={error.code} busy={generating} onRetry={start} />
      )}
      {optionsError !== null && (
        <ErrorNotice
          kind="gen"
          className="mt-6"
          message={optionsError}
          busy={generating}
          onRetry={() => {
            setOptionsError(null);
            setReload((n) => n + 1);
          }}
        />
      )}
      {!rest && <p className="reading mt-6 text-muted-foreground">{t(lang, 'today.empty')}</p>}
      {options !== null && choice !== null && (
        <div className="mt-6">
          <LessonPicker lang={lang} options={options} value={choice} disabled={generating} onChange={setChoice} />
        </div>
      )}
      <div className="mt-6 flex items-center gap-3">
        <Button disabled={generating || !ready} onClick={start}>
          {t(lang, rest ? 'today.startLight' : 'today.start')}
        </Button>
        {!rest && (
          <Toggle pressed={light} disabled={generating} onPressedChange={setLight}>
            {t(lang, 'today.light')}
          </Toggle>
        )}
      </div>
      {loader !== null && <Loader lang={lang} {...loader} />}
    </>
  );
}
