import { useState } from 'react';
import { t, type Lang } from '@/core/i18n';
import { Button } from '@/ui/components/ui/button';
import { Toggle } from '@/ui/components/ui/toggle';
import { Notice } from './chips';

function Skeleton() {
  return (
    <div aria-hidden className="mt-8 flex flex-col gap-3">
      {['w-1/3', 'w-full', 'w-5/6', 'w-full', 'w-2/3'].map((w, i) => (
        <div key={i} className={`h-4 rounded-sm bg-input ${w}`} />
      ))}
    </div>
  );
}

/** Empty state with the primary action, and the loading and error states of generation. */
export function StartSession({ lang, generating, error, onStart }: {
  lang: Lang; generating: boolean; error: string | null; onStart: (light: boolean) => void;
}) {
  const [light, setLight] = useState(false);
  return (
    <>
      {error !== null && (
        <Notice className="mt-6">
          <span>{t(lang, 'today.genError', { message: error })}</span>
          <Button variant="secondary" size="sm" disabled={generating} onClick={() => onStart(light)}>
            {t(lang, 'today.retry')}
          </Button>
        </Notice>
      )}
      <p className="reading mt-6 text-muted-foreground">{t(lang, 'today.empty')}</p>
      <div className="mt-6 flex items-center gap-3">
        <Button disabled={generating} onClick={() => onStart(light)}>
          {t(lang, 'today.start')}
        </Button>
        <Toggle pressed={light} disabled={generating} onPressedChange={setLight}>
          {t(lang, 'today.light')}
        </Toggle>
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
