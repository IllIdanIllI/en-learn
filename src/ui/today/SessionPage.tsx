import { useCallback, useEffect, useRef, useState } from 'react';
import { disputeItems, recordSupport } from '@/core/grading/actions';
import { draftsToAnswers, itemDraftKey, loadDraftAnswers, saveDraftAnswer, spotDraftKey } from '@/core/db/repos/drafts';
import { gradeSession, type ClarificationAnswer, type GradeOutcome, type Question } from '@/core/grading/grade';
import { t } from '@/core/i18n';
import { loadSessionView, type SessionView } from '@/core/session/view';
import { Button } from '@/ui/components/ui/button';
import { useCore } from '@/ui/app/CoreProvider';
import { ActionBar } from './ActionBar';
import { Block } from './Block';
import { ErrorNotice } from './ErrorNotice';
import { FeedbackSummary } from './FeedbackSummary';
import { GradedItem } from './GradedItem';
import { ItemRow } from './ItemRow';
import { GRADING_STAGES, Loader } from './Loader';
import { QuestionBlock } from './QuestionBlock';
import { Questions, type Reply } from './Questions';
import { SessionHeader } from './SessionHeader';
import { SpellingRow } from './SpellingRow';
import { SpotBlock } from './SpotBlock';
import { Notice } from './chips';
import { RulePanel, type RuleTarget } from './RulePanel';
import { SessionActionsProvider, type SessionActions } from './sessionActions';
import { GRADING_KINDS, useWaitInfo } from './useWaitInfo';

type Failure = { message: string; code?: string; retry: () => Promise<GradeOutcome> };

const DRAFT_DELAY_MS = 300;

/**
 * Answers live in component state keyed by item id and `${blockId}:${paragraph}`, and are saved as drafts (debounced)
 * so a reload or another page does not lose them. Without `onRebuild` the session cannot be rebuilt (an earlier day).
 */
export function SessionPage({ sessionId, rebuilding, onRebuild, onGraded, onClose }: {
  sessionId: number; rebuilding: boolean; onRebuild?: (light: boolean) => void; onGraded?: () => void;
  /** Today's session only: shown in the header once everything is graded. */
  onClose?: () => void;
}) {
  const { deps, lang } = useCore();
  const [view, setView] = useState<SessionView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [draftsReady, setDraftsReady] = useState(false);
  const [items, setItems] = useState<Record<number, string>>({});
  const [spot, setSpot] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<Question[]>([]);
  const [replies, setReplies] = useState<Record<number, Reply>>({});
  const [finish, setFinish] = useState(false);
  const [busy, setBusy] = useState(false);
  const waiting = useWaitInfo(GRADING_KINDS, busy);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [disputes, setDisputes] = useState<Record<number, string>>({});
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [panel, setPanel] = useState<RuleTarget | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const focusResults = useRef(false);

  useEffect(() => {
    let live = true;
    loadSessionView(deps.db, sessionId).then(
      (v) => {
        if (live) {
          setView(v);
          setLoadError(null);
          // What was saved comes back into the fields; text typed meanwhile stays.
          const saved: Record<number, string> = {};
          for (const b of v.blocks) for (const i of b.items) if (i.answer?.disputeText) saved[i.id] = i.answer.disputeText;
          setDisputes((prev) => ({ ...saved, ...prev }));
        }
      },
      (e: unknown) => {
        if (live) setLoadError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      live = false;
    };
  }, [deps, sessionId, reload]);

  useEffect(() => {
    let live = true;
    loadDraftAnswers(deps.db, sessionId).then(
      (drafts) => {
        if (!live) return;
        const restored = draftsToAnswers(drafts);
        setItems(restored.items);
        setSpot(restored.spot);
        setDraftsReady(true);
      },
      (e: unknown) => {
        console.error('loadDraftAnswers failed', e);
        if (live) setDraftsReady(true);
      },
    );
    return () => {
      live = false;
    };
  }, [deps.db, sessionId]);

  const pending = useRef(new Map<string, { text: string; timer: ReturnType<typeof setTimeout> }>());
  const write = useRef({ db: deps.db, sessionId });
  useEffect(() => {
    write.current = { db: deps.db, sessionId };
  }, [deps.db, sessionId]);
  const flushAll = useCallback(async () => {
    const entries = [...pending.current];
    pending.current.clear();
    await Promise.all(
      entries.map(([key, { text, timer }]) => {
        clearTimeout(timer);
        return saveDraftAnswer(write.current.db, write.current.sessionId, key, text).catch((e: unknown) => console.error('saveDraftAnswer failed', e));
      }),
    );
  }, []);
  const dropPending = () => {
    for (const { timer } of pending.current.values()) clearTimeout(timer);
    pending.current.clear();
  };
  const persist = (key: string, text: string) => {
    clearTimeout(pending.current.get(key)?.timer);
    const timer = setTimeout(() => {
      pending.current.delete(key);
      saveDraftAnswer(write.current.db, write.current.sessionId, key, text).catch((e: unknown) => console.error('saveDraftAnswer failed', e));
    }, DRAFT_DELAY_MS);
    pending.current.set(key, { text, timer });
  };
  // Leaving the page keeps what was typed in the last moments.
  useEffect(() => () => void flushAll(), [flushAll]);

  const handle = useCallback((outcome: GradeOutcome) => {
    if (outcome.kind === 'graded') {
      focusResults.current = true;
      onGraded?.();
      setQuestions([]);
      setFinish(false);
      setReload((n) => n + 1);
    } else if (outcome.kind === 'questions') setQuestions(outcome.questions);
    else setFailure({ message: outcome.message, code: outcome.code, retry: outcome.retry });
  }, [onGraded]);

  const run = useCallback(
    async (start: () => Promise<GradeOutcome>) => {
      setBusy(true);
      setFailure(null);
      try {
        handle(await start());
      } catch (e) {
        setFailure({ message: e instanceof Error ? e.message : String(e), retry: start });
      } finally {
        setBusy(false);
      }
    },
    [handle],
  );

  const clarifications = (): ClarificationAnswer[] =>
    Object.entries(replies).flatMap(([id, r]): ClarificationAnswer[] => {
      const itemId = Number(id);
      if (r.kind === 'blank' && r.choice === 'yes') return [{ itemId, skip: true }];
      if (r.kind === 'shorthand' && r.choice === 'yes') return [{ itemId, shorthandMeansCorrect: true }];
      if (r.kind === 'llm' && (r.text ?? '').trim() !== '') return [{ itemId, text: r.text }];
      return [];
    });

  const submit = (finishing = finish) => {
    if (!busy) {
      setFinish(finishing);
      void run(async () => {
        await flushAll(); // a late draft write must not land after the drafts are deleted by grading
        return gradeSession(deps, sessionId, { items, spot }, clarifications(), { finish: finishing });
      });
    }
  };
  const graded = view?.status === 'graded';
  // Answers are taken before grading, and for the open round of a graded session.
  const answerable = view !== null && (view.status === 'generated' || view.open);
  const done = graded && view !== null && !view.open;

  // Typed objections on graded, disputable items whose exact text has no saved reply.
  const unsent = (view?.blocks ?? []).flatMap((b) =>
    b.graded
      ? b.items.filter((i) => {
          const a = i.answer;
          const text = (disputes[i.id] ?? '').trim();
          return a != null && i.status === 'active' && (a.verdict === 'wrong' || a.verdict === 'rule_gap')
            && text !== '' && !(a.disputeReply !== null && a.disputeText === text);
        }).map((i) => i.id)
      : [],
  );
  const sendDisputes = async (ids: number[] = unsent) => {
    const entries = ids.map((itemId) => ({ itemId, text: (disputes[itemId] ?? '').trim() })).filter((e) => e.text !== '');
    if (entries.length === 0) return;
    const res = await disputeItems(deps, entries);
    setReload((n) => n + 1);
    if (!res.ok) throw new Error(res.message);
  };
  const sendAll = async () => {
    if (disputeBusy) return;
    setDisputeBusy(true);
    setDisputeError(null);
    try {
      await sendDisputes();
    } catch (e) {
      setDisputeError(e instanceof Error ? e.message : String(e));
    } finally {
      setDisputeBusy(false);
    }
  };

  const actions: SessionActions = {
    disputes,
    setDispute: (itemId, text) => setDisputes((prev) => ({ ...prev, [itemId]: text })),
    sendDisputes,
    openRule: (ref, opener) => {
      setPanel({ ...ref, opener });
      // Support (D19): reading the rule before submitting is recorded; after grading it is ignored by the core.
      if (view?.status === 'generated' && ref.topicId !== null) {
        recordSupport(deps.db, sessionId, ref.topicId).catch((e: unknown) => console.error('recordSupport failed', e));
      }
    },
    reload: () => setReload((n) => n + 1),
  };

  useEffect(() => {
    if (!answerable) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!view || loadError) return;
        submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (questions.length > 0) root.current?.querySelector<HTMLElement>('[data-question] :is(input, button)')?.focus();
  }, [questions]);

  useEffect(() => {
    if (done && focusResults.current) {
      focusResults.current = false;
      document.getElementById('feedback-title')?.focus();
    }
  }, [done]);

  if (loadError) return <Notice>{t(lang, 'today.loadError', { message: loadError })}</Notice>;
  if (!view || !draftsReady) return null;

  const rebuild = onRebuild && ((light: boolean) => {
    dropPending(); // the session and its drafts are deleted by the rebuild
    onRebuild(light);
  });
  const setAnswer = (id: number, value: string) => {
    setFinish(false);
    setItems((prev) => ({ ...prev, [id]: value }));
    persist(itemDraftKey(id), value);
    // An edited answer invalidates a yes/no given about its old text.
    setReplies((prev) => {
      if (prev[id]?.kind === 'llm' || !(id in prev)) return prev;
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
  };
  const questionFor = (id: number) => questions.find((q) => q.itemId === id);
  const inline = (id: number) => {
    const q = questionFor(id);
    return q && <Questions question={q} reply={replies[id]} lang={lang} onChange={(r) => setReplies((prev) => ({ ...prev, [id]: r }))} />;
  };

  return (
    <SessionActionsProvider value={actions}>
      <div ref={root}>
        <SessionHeader view={view} lang={lang} rebuilding={rebuilding} onRebuild={rebuild} onClose={onClose} />
        {graded && <FeedbackSummary view={view} lang={lang} />}
        {view.blocks.map((block, i) => (
          <Block key={block.id} block={block} number={i + 1} lang={lang}>
            {block.format === 'question' ? (
              <QuestionBlock block={block} />
            ) : block.format === 'spot' ? (
              <SpotBlock
                block={block}
                lang={lang}
                values={spot}
                graded={block.graded}
                onChange={(key, value) => {
                  setFinish(false);
                  setSpot((prev) => ({ ...prev, [key]: value }));
                  const [blockId, paragraph] = key.split(':').map(Number) as [number, number];
                  persist(spotDraftKey(blockId, paragraph), value);
                }}
              />
            ) : (
              <ol className="flex flex-col gap-3">
                {block.items.map((item, n) =>
                  block.graded ? (
                    <GradedItem key={item.id} item={item} number={n + 1} lang={lang} />
                  ) : block.format === 'spelling' ? (
                    <SpellingRow key={item.id} item={item} number={n + 1} lang={lang} value={items[item.id] ?? ''} onChange={(v) => setAnswer(item.id, v)}>
                      {inline(item.id)}
                    </SpellingRow>
                  ) : (
                    <ItemRow key={item.id} item={item} number={n + 1} lang={lang} value={items[item.id] ?? ''} onChange={(v) => setAnswer(item.id, v)}>
                      {inline(item.id)}
                    </ItemRow>
                  ),
                )}
              </ol>
            )}
          </Block>
        ))}
        {(answerable || unsent.length > 0) && (
          <>
            <div className="h-12" />
            {busy && <Loader lang={lang} stages={GRADING_STAGES} current="grading" attempt={1} {...waiting} />}
            {disputeError !== null && <Notice className="mb-2">{t(lang, 'dispute.error', { message: disputeError })}</Notice>}
            {answerable && failure && (
              <ErrorNotice
                kind="grade"
                className="mb-2"
                message={failure.message}
                code={failure.code}
                busy={busy}
                onRetry={() => void run(failure.retry)}
              />
            )}
            <ActionBar>
              {answerable && (
                <>
                  <Button id="check-answers" disabled={busy} onClick={() => submit()}>
                    {t(lang, busy ? 'today.checking' : 'today.check')}
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => submit(true)}>
                    {t(lang, 'today.finish')}
                  </Button>
                </>
              )}
              {unsent.length > 0 && (
                <Button variant="secondary" disabled={disputeBusy} onClick={() => void sendAll()}>
                  {t(lang, disputeBusy ? 'dispute.sending' : 'dispute.sendAll', { n: unsent.length })}
                </Button>
              )}
            </ActionBar>
          </>
        )}
      </div>
    <RulePanel target={panel} onClose={() => setPanel(null)} />
    </SessionActionsProvider>
  );
}
