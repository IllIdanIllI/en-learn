import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ISODate } from '@/core/domain';
import { formatTitleDate } from '@/core/dates';
import { t } from '@/core/i18n';
import { closeSession } from '@/core/db/repos/sessions';
import { extendSession } from '@/core/session/extend';
import { generateSession, rebuildSession, type GenerateResult, type GenStage, type OnStage } from '@/core/session/generate';
import { getTodayState, type TodayState } from '@/core/session/plan';
import { reopenSkipped, skippedToSolve } from '@/core/session/skipped';
import { useCore } from '@/ui/app/CoreProvider';
import { Button } from '@/ui/components/ui/button';
import { Notice } from '@/ui/today/chips';
import { LessonClosed } from '@/ui/today/LessonClosed';
import { RuleDraft } from '@/ui/today/RuleDraft';
import { SessionPage } from '@/ui/today/SessionPage';
import { ErrorNotice } from '@/ui/today/ErrorNotice';
import { StartSession, type GenError } from '@/ui/today/StartSession';
import { GENERATION_STAGES, Loader, type LoaderView } from '@/ui/today/Loader';
import { GENERATION_KINDS, useWaitInfo } from '@/ui/today/useWaitInfo';

export function Today() {
  const { deps, lang, version, prereq } = useCore();
  const noClaude = prereq !== null && !prereq.ok;
  const [state, setState] = useState<TodayState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<GenError | null>(null);
  const [progress, setProgress] = useState<{ stage: GenStage; attempt: number }>({ stage: 'writing', attempt: 1 });
  const waiting = useWaitInfo(GENERATION_KINDS, generating);
  // A graded session of an earlier day stays on screen after grading, until the page is left.
  const [pinned, setPinned] = useState<number | null>(null);
  // A closed lesson shows its results below the card on request.
  const [showResults, setShowResults] = useState(false);
  // Skipped questions of today or yesterday that can be solved, and the session being solved right now.
  const [skipped, setSkipped] = useState<{ sessionId: number; count: number } | null>(null);
  const [solving, setSolving] = useState<number | null>(null);
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

  useEffect(() => {
    let live = true;
    skippedToSolve(deps).then(
      (s) => {
        if (live) setSkipped(s);
      },
      () => {
        if (live) setSkipped(null);
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

  const build = useCallback(async (job: (onStage: OnStage) => Promise<GenerateResult>) => {
    if (starting.current) return;
    starting.current = true;
    setGenerating(true);
    setGenError(null);
    setProgress({ stage: 'writing', attempt: 1 });
    try {
      const res = await job((stage, attempt) => setProgress({ stage, attempt }));
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
  const start = (light: boolean) => void build((onStage) => generateSession(deps, { light }, onStage));
  const addMore = (sessionId: number) => {
    setShowResults(false);
    void build((onStage) => extendSession(deps, sessionId, onStage));
  };
  const close = (sessionId: number) => {
    setGenError(null);
    closeSession(deps.db, sessionId).then(
      () => setReload((n) => n + 1),
      (e: unknown) => setGenError({ message: e instanceof Error ? e.message : String(e) }),
    );
  };
  const solve = (sessionId: number) => {
    setGenError(null);
    reopenSkipped(deps.db, sessionId).then(
      () => setSolving(sessionId),
      (e: unknown) => setGenError({ message: e instanceof Error ? e.message : String(e) }),
    );
  };
  const lastLight = useRef(false);
  const rebuild = (sessionId: number, light: boolean) => {
    lastLight.current = light;
    void build((onStage) => rebuildSession(deps, sessionId, { light }, onStage));
  };
  const loader: LoaderView | null = generating
    ? { stages: GENERATION_STAGES, current: progress.stage, attempt: progress.attempt, ...waiting }
    : null;

  if (loadError) {
    return (
      <>
        <h1 className="headline">{t(lang, 'nav.today')}</h1>
        <Notice className="mt-6">{t(lang, 'today.loadError', { message: loadError })}</Notice>
      </>
    );
  }
  if (!state) return <h1 className="headline">{t(lang, 'nav.today')}</h1>;
  if (solving !== null) {
    return (
      <SessionPage
        key={`solving:${solving}:${epoch}`}
        sessionId={solving}
        rebuilding={false}
        solving
        onGraded={() => {
          setSolving(null);
          setReload((n) => n + 1);
        }}
      />
    );
  }
  const solveButton = skipped !== null && (
    <Button variant="secondary" disabled={generating} onClick={() => solve(skipped.sessionId)}>
      {t(lang, 'today.solveSkipped', { n: skipped.count })}
    </Button>
  );
  // One layout for today's session and an earlier one, so the page below is never remounted when the day changes.
  const shown: { id: number; earlier: boolean; restDay: boolean; date?: ISODate } | null =
    state.kind === 'session' ? { id: state.sessionId, earlier: false, restDay: false }
    : state.kind === 'earlier_session' ? { id: state.sessionId, earlier: true, restDay: state.restDay, date: state.date }
    : pinned !== null ? { id: pinned, earlier: true, restDay: state.kind === 'rest' }
    : null;
  const closed = state.kind === 'session' && state.closed;
  if (shown) {
    return (
      <>
        {!closed && solveButton && <div className="mb-6">{solveButton}</div>}
        {genError !== null && (
          <ErrorNotice
            kind="gen"
            className="mb-6"
            message={genError.message}
            code={genError.code}
            busy={generating}
            onRetry={() => (shown.earlier ? start(shown.restDay) : closed ? addMore(shown.id) : rebuild(shown.id, lastLight.current))}
          />
        )}
        {shown.earlier && (
          <>
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
            {loader !== null && <Loader lang={lang} {...loader} />}
          </>
        )}
        {closed && (
          <LessonClosed
            lang={lang}
            loader={loader}
            showingResults={showResults}
            onToggleResults={() => setShowResults((v) => !v)}
            onAddMore={() => addMore(shown.id)}
          >
            {solveButton}
          </LessonClosed>
        )}
        {(!closed || showResults) && (
          <SessionPage
            key={`${shown.id}:${epoch}`}
            sessionId={shown.id}
            rebuilding={generating}
            loader={shown.earlier || closed ? null : loader}
            onRebuild={shown.earlier ? undefined : (light) => rebuild(shown.id, light)}
            onGraded={shown.earlier ? () => setPinned(shown.id) : undefined}
            onClose={shown.earlier || closed ? undefined : () => close(shown.id)}
          />
        )}
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
      {solveButton && <div className="mt-6">{solveButton}</div>}
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
          {noClaude ? claudeNotice : <StartSession lang={lang} loader={loader} error={genError} rest onStart={start} />}
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
          <StartSession lang={lang} loader={loader} error={genError} onStart={start} />
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
