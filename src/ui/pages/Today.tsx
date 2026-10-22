import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '@/core/i18n';
import { generateSession } from '@/core/session/generate';
import { getTodayState, type TodayState } from '@/core/session/plan';
import { useCore } from '@/ui/app/CoreProvider';
import { Notice } from '@/ui/today/chips';
import { SessionPage } from '@/ui/today/SessionPage';
import { StartSession } from '@/ui/today/StartSession';

export function Today() {
  const { deps, lang, version } = useCore();
  const [state, setState] = useState<TodayState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const starting = useRef(false);

  useEffect(() => {
    let live = true;
    getTodayState(deps).then(
      (s) => {
        if (live) setState(s);
      },
      (e: unknown) => {
        if (live) setLoadError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      live = false;
    };
  }, [deps, version, reload]);

  const start = useCallback(
    async (light: boolean) => {
      if (starting.current) return;
      starting.current = true;
      setGenerating(true);
      setGenError(null);
      try {
        const res = await generateSession(deps, { light });
        if (res.ok) setReload((n) => n + 1);
        else setGenError(res.message);
      } catch (e) {
        setGenError(e instanceof Error ? e.message : String(e));
      } finally {
        starting.current = false;
        setGenerating(false);
      }
    },
    [deps],
  );

  if (loadError) {
    return (
      <>
        <h1 className="headline">{t(lang, 'nav.today')}</h1>
        <Notice className="mt-6">{t(lang, 'today.loadError', { message: loadError })}</Notice>
      </>
    );
  }
  if (!state) return <h1 className="headline">{t(lang, 'nav.today')}</h1>;
  if (state.kind === 'session') return <SessionPage key={state.sessionId} sessionId={state.sessionId} />;

  return (
    <>
      <h1 className="headline">{t(lang, state.kind === 'rest' ? 'today.rest' : 'nav.today')}</h1>
      {state.kind === 'no_programme' && (
        <p className="reading mt-6">
          {t(lang, 'today.noProgramme')}{' '}
          <Link to="/setup" className="text-primary underline underline-offset-2">
            {t(lang, 'today.setupLink')}
          </Link>
        </p>
      )}
      {state.kind === 'rest' && <p className="reading mt-6 text-muted-foreground">{t(lang, 'today.restNote')}</p>}
      {state.kind === 'rule_missing' && (
        <p className="reading mt-6">{t(lang, 'today.ruleMissing', { topic: state.topics[0]?.title ?? '' })}</p>
      )}
      {state.kind === 'no_session' && <StartSession lang={lang} generating={generating} error={genError} onStart={(light) => void start(light)} />}
    </>
  );
}
