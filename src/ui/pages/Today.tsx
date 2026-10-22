import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '@/core/i18n';
import { generateSession, rebuildSession, type GenerateResult } from '@/core/session/generate';
import { getTodayState, type TodayState } from '@/core/session/plan';
import { useCore } from '@/ui/app/CoreProvider';
import { Button } from '@/ui/components/ui/button';
import { Notice } from '@/ui/today/chips';
import { RuleDraft } from '@/ui/today/RuleDraft';
import { SessionPage } from '@/ui/today/SessionPage';
import { StartSession } from '@/ui/today/StartSession';

export function Today() {
  const { deps, lang, version } = useCore();
  const [state, setState] = useState<TodayState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // Bumped after every build: a deleted session's id can be reused, and the page must not keep its answers.
  const [epoch, setEpoch] = useState(0);
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

  // The state is read again when the window gets focus (a midnight rollover), except while a session is being built.
  useEffect(() => {
    const onFocus = () => {
      if (!starting.current) setReload((n) => n + 1);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const build = useCallback(async (job: () => Promise<GenerateResult>) => {
    if (starting.current) return;
    starting.current = true;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await job();
      if (!res.ok) setGenError(res.message);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      starting.current = false;
      setGenerating(false);
      // A failed rebuild has already removed the old session, so the state is read in every case.
      setEpoch((n) => n + 1);
      setReload((n) => n + 1);
    }
  }, []);
  const start = (light: boolean) => void build(() => generateSession(deps, { light }));
  const lastLight = useRef(false);
  const rebuild = (sessionId: number, light: boolean) => {
    lastLight.current = light;
    void build(() => rebuildSession(deps, sessionId, { light }));
  };

  if (loadError) {
    return (
      <>
        <h1 className="headline">{t(lang, 'nav.today')}</h1>
        <Notice className="mt-6">{t(lang, 'today.loadError', { message: loadError })}</Notice>
      </>
    );
  }
  if (!state) return <h1 className="headline">{t(lang, 'nav.today')}</h1>;
  if (state.kind === 'session') {
    return (
      <>
        {genError !== null && (
          <Notice className="mb-6">
            <span>{t(lang, 'today.genError', { message: genError })}</span>
            <Button variant="secondary" size="sm" disabled={generating} onClick={() => rebuild(state.sessionId, lastLight.current)}>
              {t(lang, 'today.retry')}
            </Button>
          </Notice>
        )}
        <SessionPage
          key={`${state.sessionId}:${epoch}`}
          sessionId={state.sessionId}
          rebuilding={generating}
          onRebuild={(light) => rebuild(state.sessionId, light)}
        />
      </>
    );
  }

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
      {state.kind === 'rest' && (
        <>
          <p className="reading mt-6 text-muted-foreground">{t(lang, 'today.restNote')}</p>
          <StartSession lang={lang} generating={generating} error={genError} rest onStart={start} />
        </>
      )}
      {state.kind === 'rule_missing' && state.topics[0] && (
        <div className="mt-6">
          <RuleDraft
            key={state.topics[0].id}
            topic={state.topics[0]}
            lang={lang}
            label={t(lang, 'today.ruleMissing', { topic: state.topics[0].title })}
            onSaved={() => setReload((n) => n + 1)}
          />
        </div>
      )}
      {state.kind === 'no_session' && (
        <>
          <StartSession lang={lang} generating={generating} error={genError} onStart={start} />
          {state.missingRuleTopics.length > 0 && (
            <section className="mt-12">
              <p className="text-muted-foreground">{t(lang, 'today.missingSpotRules')}</p>
              <ul className="mt-4 flex flex-col gap-6">
                {state.missingRuleTopics.map((topic) => (
                  <li key={topic.id}>
                    <RuleDraft topic={topic} lang={lang} label={topic.title} quiet onSaved={() => setReload((n) => n + 1)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
