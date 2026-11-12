import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSettings } from '@/core/db/repos/settings';
import { t } from '@/core/i18n';
import { insertRetry } from '@/core/words/plan';
import { extraNewFor } from '@/core/words/queue';
import {
  addExtraNew, buildPractice, extraCardFor, loadWordViews, recordAnswer, stageChanges, wordsOverview,
  type PracticeCard,
} from '@/core/words/practice';
import type { ReviewResult, Stage } from '@/core/words/types';
import { useCore } from '@/ui/app/CoreProvider';
import { Button, buttonVariants } from '@/ui/components/ui/button';
import { Notice } from '@/ui/today/chips';
import { CardView } from '@/ui/words/CardView';
import { PracticeEnd } from '@/ui/words/PracticeEnd';

type Ended = { correct: number; total: number; up: { word: string; stage: Stage }[]; down: { word: string; stage: Stage }[]; canContinue: boolean; canAddNew: boolean };

function Practice({ onContinue }: { onContinue: () => void }) {
  const { deps, lang } = useCore();
  const [cards, setCards] = useState<PracticeCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ended, setEnded] = useState<Ended | null>(null);
  const started = useRef(false);
  const before = useRef(new Map<number, Stage>());
  // First card of each word in this practice (true = not wrong); later cards are not counted.
  const first = useRef(new Map<number, boolean>());
  // Words that already got their extra card in this practice (one per word).
  const extraGiven = useRef(new Set<number>());

  useEffect(() => {
    // Guarded by a ref: StrictMode mounts twice and the queue must be built once.
    if (started.current) return;
    started.current = true;
    (async () => {
      const views = await loadWordViews(deps.db);
      before.current = new Map(views.map((v) => [v.word.id, v.state.stage]));
      const extra = extraNewFor((await getSettings(deps.db)).wordsExtraNew, deps.clock.today());
      const built = await buildPractice(deps, 'review', extra);
      if (built.length === 0) setNextDue((await wordsOverview(deps.db, deps.clock.today(), extra)).nextDue);
      setCards(built);
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async () => {
    try {
      const views = await loadWordViews(deps.db);
      const after = new Map(views.map((v) => [v.word.id, v.state.stage]));
      const names = new Map(views.map((v) => [v.word.id, v.word.word]));
      const answers = [...first.current.values()];
      const extra = extraNewFor((await getSettings(deps.db)).wordsExtraNew, deps.clock.today());
      const overview = await wordsOverview(deps.db, deps.clock.today(), extra);
      setEnded({
        correct: answers.filter(Boolean).length,
        total: answers.length,
        ...stageChanges(before.current, after, names),
        canContinue: overview.available > 0,
        canAddNew: overview.canAddNew,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const advance = (list: PracticeCard[], from: number) => {
    if (from + 1 >= list.length) void finish();
    else setIndex(from + 1);
  };

  const onResult = async (pc: PracticeCard, at: number, result: ReviewResult, text: string, recorded: boolean) => {
    if (!recorded) await recordAnswer(deps, { wordId: pc.wordId, cardType: pc.card.type, exerciseId: pc.card.exercise?.id ?? null, result, text });
    if (!first.current.has(pc.wordId)) first.current.set(pc.wordId, result !== 'wrong');
    if (result === 'wrong' && !extraGiven.current.has(pc.wordId)) {
      extraGiven.current.add(pc.wordId);
      // This word's items still ahead in the practice: the extra card should not repeat one of them.
      const queued = (cards ?? []).slice(at + 1)
        .filter((c) => c.wordId === pc.wordId)
        .flatMap((c) => (c.card.exercise ? [c.card.exercise.id] : []));
      const views = await loadWordViews(deps.db);
      const view = views.find((v) => v.word.id === pc.wordId);
      const extra = view ? extraCardFor(view, pc.card.type, views.map((v) => v.word), deps.rand ?? Math.random, queued) : null;
      if (extra) setCards((cur) => (cur ? insertRetry(cur, at, extra) : cur));
    }
  };

  if (error !== null) return <Notice className="mt-6">{t(lang, 'words.loadError', { message: error })}</Notice>;
  if (ended) {
    return (
      <PracticeEnd
        {...ended}
        onContinue={onContinue}
        onAddNew={async () => {
          await addExtraNew(deps.db, deps.clock.today());
          onContinue();
        }}
      />
    );
  }
  if (!cards) return null;
  if (cards.length === 0) {
    return (
      <>
        <h1 className="headline">{t(lang, 'nav.words')}</h1>
        <p className="reading mt-6 text-muted-foreground">
          {nextDue ? t(lang, 'words.allDone', { date: nextDue }) : t(lang, 'words.allDoneNoNext')}
        </p>
        <Link to="/words" className={buttonVariants({ variant: 'secondary', className: 'mt-6' })}>{t(lang, 'words.back')}</Link>
      </>
    );
  }
  const pc = cards[index];
  if (!pc) return null;
  return (
    <>
      <header className="flex items-center justify-between">
        <span className="tabular text-muted-foreground">{index + 1} / {cards.length}</span>
        <Button variant="ghost" disabled={pending} onClick={() => void finish()}>{t(lang, 'words.practice.end')}</Button>
      </header>
      <div className="mt-6">
        <CardView
          key={`${index}:${pc.wordId}:${pc.card.type}:${pc.card.exercise?.id ?? 0}`}
          pc={pc}
          onResult={async (r, text, recorded) => {
            setPending(true);
            try {
              await onResult(pc, index, r, text, recorded);
            } finally {
              setPending(false);
            }
          }}
          onNext={() => advance(cards, index)}
        />
      </div>
    </>
  );
}

export function WordsPractice() {
  const [run, setRun] = useState(0);
  return <Practice key={run} onContinue={() => setRun((n) => n + 1)} />;
}
