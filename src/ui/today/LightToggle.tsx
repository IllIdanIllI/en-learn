import { useState } from 'react';
import { t, type Lang } from '@/core/i18n';
import { Button } from '@/ui/components/ui/button';
import { Toggle } from '@/ui/components/ui/toggle';

/**
 * Header controls of a generated, ungraded session: the light day toggle and Rebuild. Switching the toggle only
 * offers Rebuild (it becomes a secondary button); the session is replaced when Rebuild is pressed.
 */
export function LightToggle({ isLight, lang, busy, onRebuild }: {
  isLight: boolean; lang: Lang; busy: boolean; onRebuild: (light: boolean) => void;
}) {
  const [light, setLight] = useState(isLight);
  return (
    <div className="mt-3 -ml-2.5 flex flex-wrap items-center gap-1">
      <Toggle size="sm" pressed={light} disabled={busy} onPressedChange={setLight}>
        {t(lang, 'today.light')}
      </Toggle>
      <Button variant={light === isLight ? 'ghost' : 'secondary'} size="sm" disabled={busy} onClick={() => onRebuild(light)}>
        {t(lang, 'today.rebuild')}
      </Button>
    </div>
  );
}
