import { useState } from 'react';
import { t, type Lang } from '@/core/i18n';
import { Button } from '@/ui/components/ui/button';
import { Toggle } from '@/ui/components/ui/toggle';
import { ErrorNotice } from './ErrorNotice';
import { Loader, type LoaderView } from './Loader';

export type GenError = { message: string; code?: string };

/** Empty state with the primary action, and the loading and error states of generation. */
export function StartSession({ lang, loader, error, rest = false, onStart }: {
  lang: Lang; loader: LoaderView | null; error: GenError | null; rest?: boolean; onStart: (light: boolean) => void;
}) {
  const [lightChoice, setLight] = useState(false);
  const generating = loader !== null;
  // A rest day has no toggle: the only way to practise is a light day.
  const light = rest || lightChoice;
  return (
    <>
      {error !== null && (
        <ErrorNotice kind="gen" className="mt-6" message={error.message} code={error.code} busy={generating} onRetry={() => onStart(light)} />
      )}
      {!rest && <p className="reading mt-6 text-muted-foreground">{t(lang, 'today.empty')}</p>}
      <div className="mt-6 flex items-center gap-3">
        <Button disabled={generating} onClick={() => onStart(light)}>
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
