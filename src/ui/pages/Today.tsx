import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ISODate } from '@/core/domain';
import { formatTitleDate } from '@/core/dates';
import { t } from '@/core/i18n';
import { generateSession, rebuildSession, type GenerateResult } from '@/core/session/generate';
import { getTodayState, type TodayState } from '@/core/session/plan';
import { useCore } from '@/ui/app/CoreProvider';
import { Button } from '@/ui/components/ui/button';
import { Notice } from '@/ui/today/chips';
import { RuleDraft } from '@/ui/today/RuleDraft';
import { SessionPage } from '@/ui/today/SessionPage';
import { ErrorNotice } from '@/ui/today/ErrorNotice';
import { StartSession, type GenError } from '@/ui/today/StartSession';

export function Today() {
  const { deps, lang, version, prereq } = useCore();
  const noClaude = prereq !== null && !prereq.ok;
  const [state, setState] = useState<TodayState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<GenError | null>(null);
  // A graded session of an earlier day stays on screen after grading, until the page is left.
  const [pinned, setPinned] = useState<number | null>(null);
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
      if (!res.ok) setGenError({ message: res.message, code: res.code });
    } catch (e) {
      setGenError({ message: e instanceof Error ? e.message : String(e) });
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
  // One layout for today's session and an earlier one, so the page below is never remounted when the day changes.
  const shown: { id: number; earlier: boolean; restDay: boolean; date?: ISODate } | null =
    state.kind === 'session' ? { id: state.sessionId, earlier: false, restDay: false }
    : state.kind === 'earlier_session' ? { id: state.sessionId, earlier: true, restDay: state.restDay, date: state.date }
    : pinned !== null ? { id: pinned, earlier: true, restDay: state.kind === 'rest' }
    : null;
  if (shown) {
    return (
      <>
        {genError !== null && (
          <ErrorNotice
            kind="gen"
            className="mb-6"
            message={genError.message}
            code={genError.code}
            busy={generating}
            onRetry={() => (shown.earlier ? start(shown.restDay) : rebuild(shown.id, lastLight.current))}
          />
        )}
        {shown.earlier && (
          <Notice className="mb-6">
            <span>
              {shown.date !== undefined ? t(lang, 'today.earlier', { date: formatTitleDate(shown.date, lang) }) : t(lang, 'today.notStarted')}
            </span>
            {noClaude ? (
              <Link to="/prerequisites" className="underline underline-offset-2">{t(lang, 'today.noClaudeLink')}</Link>
            ) : (
              <Button variant="secondary" size="sm" disabled={generating} onClick={() => start(shown.restDay)}>
                {t(lang, 'today.startToday')}
              </Button>
            )}
          </Notice>
        )}
        <SessionPage
          key={`${shown.id}:${epoch}`}
          sessionId={shown.id}
          rebuilding={generating}
          onRebuild={shown.earlier ? undefined : (light) => rebuild(shown.id, light)}
          onGraded={shown.earlier ? () => setPinned(shown.id) : undefined}
        />
      </>
    );
  }

  const claudeNotice = (
    <Notice className="mt-6">
      <span>{t(lang, 'today.noClaude')}</span>
      <Link to="/prerequisites" className="underline underline-offset-2">{t(lang, 'today.noClaudeLink')}</Link>
    </Notice>
  );

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
          {noClaude ? claudeNotice : <StartSession lang={lang} generating={generating} error={genError} rest onStart={start} />}
        </>
      )}
      {state.kind === 'rule_missing' && noClaude && claudeNotice}
      {state.kind === 'rule_missing' && !noClaude && state.topics[0] && (
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
      {state.kind === 'no_session' && noClaude && claudeNotice}
      {state.kind === 'no_session' && !noClaude && (
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
