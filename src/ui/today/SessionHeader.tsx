import { t, type Lang } from '@/core/i18n';
import type { SessionView } from '@/core/session/view';
import { Button } from '@/ui/components/ui/button';
import { LightToggle } from './LightToggle';
import { useSessionActions } from './sessionActions';

/** The link is the section, set in the line "Read § X before block N"; it opens the rule panel. */
export function SessionHeader({ view, lang, rebuilding, onRebuild, onClose }: {
  view: SessionView; lang: Lang; rebuilding: boolean; onRebuild?: (light: boolean) => void; onClose?: () => void;
}) {
  const { openRule } = useSessionActions();
  const first = view.readFirst;
  // Split on a marker so the section can be a button inside the sentence.
  const [before = '', after = ''] = first ? t(lang, 'today.readFirst', { section: '\u0000', n: first.blockNumber }).split('\u0000') : [];
  return (
    <header>
      <h1 className="headline">{view.title}</h1>
      <p className="mt-2 text-muted-foreground">
        <span className="tabular">{t(lang, 'today.minutes', { n: view.totalMinutes })}</span>
        {first && (
          <>
            {' · '}
            {before}
            {first.ruleId === null ? (
              `§ ${first.section}`
            ) : (
              <button
                type="button"
                className="rounded-sm text-primary underline underline-offset-2"
                onClick={(e) => openRule({ ruleId: first.ruleId!, topicId: first.topicId, section: first.section }, e.currentTarget)}
              >
                § {first.section}
              </button>
            )}
            {after}
          </>
        )}
      </p>
      {view.status === 'graded' && !view.open && onClose && (
        <Button className="mt-4" onClick={onClose}>{t(lang, 'today.close')}</Button>
      )}
      {view.status === 'generated' && onRebuild && <LightToggle isLight={view.isLight} lang={lang} busy={rebuilding} onRebuild={onRebuild} />}
    </header>
  );
}
