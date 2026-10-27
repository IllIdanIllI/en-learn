import { useState } from 'react';
import { t, type Lang } from '@/core/i18n';
import { Button } from '@/ui/components/ui/button';
import { Toggle } from '@/ui/components/ui/toggle';
import { ErrorNotice } from './ErrorNotice';

export type GenError = { message: string; code?: string };

export function Skeleton() {
  return (
    <div aria-hidden className="mt-8 flex flex-col gap-3">
      {['w-1/3', 'w-full', 'w-5/6', 'w-full', 'w-2/3'].map((w, i) => (
        <div key={i} className={`h-4 rounded-sm bg-input ${w}`} />
      ))}
    </div>
  );
}

/** Empty state with the primary action, and the loading and error states of generation. */
export function StartSession({ lang, generating, error, rest = false, onStart }: {
  lang: Lang; generating: boolean; error: GenError | null; rest?: boolean; onStart: (light: boolean) => void;
}) {
  const [lightChoice, setLight] = useState(false);
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
      <div role="status">
        {generating && (
          <>
            <Skeleton />
            <p className="mt-4 text-muted-foreground">{t(lang, 'today.generating')}</p>
          </>
        )}
      </div>
    </>
  );
}
