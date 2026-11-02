import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ISODate } from '@/core/domain';
import { formatTitleDate } from '@/core/dates';
import { t } from '@/core/i18n';
import { closeSession } from '@/core/db/repos/sessions';
import type { LessonChoice, TaskFormat } from '@/core/session/choice';
import { extendSession } from '@/core/session/extend';
import { generateSession, rebuildSession } from '@/core/session/generate';
import { getTodayState, type TodayState } from '@/core/session/plan';
import { reopenSkipped, skippedToSolve } from '@/core/session/skipped';
import { useCore } from '@/ui/app/CoreProvider';
import { useGeneration } from '@/ui/app/GenerationProvider';
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
  const { deps, lang, version, prereq, refresh } = useCore();
  const noClaude = prereq !== null && !prereq.ok;
  // Read on every render: a new day reaches the picker when the page re-reads its state (on focus).
  const today = deps.clock.today();
  const [state, setState] = useState<TodayState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The job lives above the routes: it keeps running, and its loader stays, when the page is left.
  const gen = useGeneration();
  const generating = gen.running;
  // Errors of closing a lesson or reopening skipped questions; those of a job are `gen.error`.
  const [actionError, setActionError] = useState<GenError | null>(null);
  const genError = gen.error ?? actionError;
  const waiting = useWaitInfo(GENERATION_KINDS, generating);
  // A graded session of an earlier day stays on screen after grading, until the page is left.
  const [pinned, setPinned] = useState<number | null>(null);
  // A closed lesson shows its results below the card on request.
  const [showResults, setShowResults] = useState(false);
  // Skipped questions of today or yesterday that can be solved, and the session being solved right now.
  const [skipped, setSkipped] = useState<{ sessionId: number; count: number } | null>(null);
  const [solving, setSolving] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  // Changes after every job: a deleted session's id can be reused, and the page must not keep its answers.
  const epoch = gen.version;

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
  }, [deps, version, reload, gen.version]);

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
  }, [deps, version, reload, gen.version]);

  // The state is read again when the window gets focus (a midnight rollover), except while a session is being built.
  useEffect(() => {
    const onFocus = () => {
      if (!generating) setReload((n) => n + 1);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [generating]);

  const start = (light: boolean, choice?: LessonChoice) => void gen.run((onStage) => generateSession(deps, { light, choice }, onStage));
  // The formats of the last added round, so that its retry adds the same round.
  const lastFormats = useRef<TaskFormat[]>([]);
  const addMore = (sessionId: number, formats: TaskFormat[]) => {
    setShowResults(false);
    lastFormats.current = formats;
    // Extending reopens the session, which the sidebar garden shows.
    void gen.run((onStage) => extendSession(deps, sessionId, formats, onStage)).then(refresh);
  };
  const close = (sessionId: number) => {
    setActionError(null);
    closeSession(deps.db, sessionId).then(
      () => {
        setReload((n) => n + 1);
        refresh();
      },
      (e: unknown) => setActionError({ message: e instanceof Error ? e.message : String(e) }),
    );
  };
  const solve = (sessionId: number) => {
    setActionError(null);
    reopenSkipped(deps.db, sessionId, deps.clock.today())
      .then(async (n) => {
        // A stale count (another window): with nothing left to solve, refresh instead of showing an empty page.
        if (n === 0 && (await skippedToSolve(deps))?.sessionId !== sessionId) setReload((r) => r + 1);
        else setSolving(sessionId);
      })
      .catch((e: unknown) => setActionError({ message: e instanceof Error ? e.message : String(e) }));
  };
  const lastLight = useRef(false);
  const rebuild = (sessionId: number, light: boolean) => {
    lastLight.current = light;
    void gen.run((onStage) => rebuildSession(deps, sessionId, { light }, onStage));
  };
  const loader: LoaderView | null = gen.progress
    ? { stages: GENERATION_STAGES, current: gen.progress.stage, attempt: gen.progress.attempt, ...waiting }
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
            onRetry={() => (shown.earlier ? start(shown.restDay) : closed ? addMore(shown.id, lastFormats.current) : rebuild(shown.id, lastLight.current))}
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
            sessionId={shown.id}
            loader={loader}
            showingResults={showResults}
            onToggleResults={() => setShowResults((v) => !v)}
            onAdd={(formats) => addMore(shown.id, formats)}
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
            onGraded={() => {
              if (shown.earlier) setPinned(shown.id);
              setReload((n) => n + 1); // the skipped count changes with every grading
            }}
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
          {noClaude ? claudeNotice : <StartSession lang={lang} today={today} loader={loader} error={genError} rest onStart={start} />}
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
          <StartSession lang={lang} today={today} loader={loader} error={genError} onStart={start} />
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
