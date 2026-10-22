import { useCallback, useEffect, useRef, useState } from 'react';
import { gradeSession, type ClarificationAnswer, type GradeOutcome, type Question } from '@/core/grading/grade';
import { t } from '@/core/i18n';
import { loadSessionView, type SessionView } from '@/core/session/view';
import { Button } from '@/ui/components/ui/button';
import { useCore } from '@/ui/app/CoreProvider';
import { Block } from './Block';
import { FeedbackSummary } from './FeedbackSummary';
import { GradedItem } from './GradedItem';
import { ItemRow } from './ItemRow';
import { QuestionBlock } from './QuestionBlock';
import { Questions, type Reply } from './Questions';
import { SessionHeader } from './SessionHeader';
import { SpellingRow } from './SpellingRow';
import { SpotBlock } from './SpotBlock';
import { Notice } from './chips';

type Failure = { message: string; retry: () => Promise<GradeOutcome> };

/** Answers live in component state keyed by item id and `${blockId}:${paragraph}`; a reload loses them. */
export function SessionPage({ sessionId }: { sessionId: number }) {
  const { deps, lang } = useCore();
  const [view, setView] = useState<SessionView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [items, setItems] = useState<Record<number, string>>({});
  const [spot, setSpot] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<Question[]>([]);
  const [replies, setReplies] = useState<Record<number, Reply>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const focusResults = useRef(false);

  useEffect(() => {
    let live = true;
    loadSessionView(deps.db, sessionId).then(
      (v) => {
        if (live) {
          setView(v);
          setLoadError(null);
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

  const handle = useCallback((outcome: GradeOutcome) => {
    if (outcome.kind === 'graded') {
      focusResults.current = true;
      setQuestions([]);
      setReload((n) => n + 1);
    } else if (outcome.kind === 'questions') setQuestions(outcome.questions);
    else setFailure({ message: outcome.message, retry: outcome.retry });
  }, []);

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

  const submit = () => {
    if (!busy) void run(() => gradeSession(deps, sessionId, { items, spot }, clarifications()));
  };
  const graded = view?.status === 'graded';

  useEffect(() => {
    if (graded) return;
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
    if (graded && focusResults.current) {
      focusResults.current = false;
      document.getElementById('feedback-title')?.focus();
    }
  }, [graded]);

  if (loadError) return <Notice>{t(lang, 'today.loadError', { message: loadError })}</Notice>;
  if (!view) return null;

  const setAnswer = (id: number, value: string) => {
    setItems((prev) => ({ ...prev, [id]: value }));
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
    <div ref={root}>
      <SessionHeader view={view} lang={lang} />
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
              graded={graded}
              onChange={(key, value) => setSpot((prev) => ({ ...prev, [key]: value }))}
            />
          ) : (
            <ol className="flex flex-col gap-3">
              {block.items.map((item, n) =>
                graded ? (
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
      {!graded && (
        <div className="mt-12">
          {failure && (
            <Notice className="mb-4">
              <span>{t(lang, 'grade.error', { message: failure.message })}</span>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run(failure.retry)}>
                {t(lang, 'today.retry')}
              </Button>
            </Notice>
          )}
          <Button id="check-answers" disabled={busy} onClick={submit}>
            {t(lang, busy ? 'today.checking' : 'today.check')}
          </Button>
        </div>
      )}
    </div>
  );
}
