import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import { t } from '@/core/i18n';
import type { WordCheckReply } from '@/core/llm/types';
import { buildResult, checkTranslation, checkTyped, clueOf, normalise, resultFor, spellingsOf, withSpaces } from '@/core/words/check';
import { BUILD_ATTEMPTS } from '@/core/words/constants';
import { wordLink } from '@/core/words/link';
import { checkUseIt, type PracticeCard } from '@/core/words/practice';
import type { ReviewResult } from '@/core/words/types';
import { cn } from '@/lib/utils';
import { useCore } from '@/ui/app/CoreProvider';
import { Button } from '@/ui/components/ui/button';
import { ExternalLink } from '@/ui/components/ExternalLink';
import { Input } from '@/ui/components/ui/input';
import { Textarea } from '@/ui/components/ui/textarea';
import { Notice } from '@/ui/today/chips';
import { WordCard } from './WordCard';
import type { SpellingVariant } from './speech';

export interface CardProps {
  pc: PracticeCard;
  spelling: SpellingVariant;
  /** Records the result; `recorded` is true when the service already saved it (use it). Resolves once saved. */
  onResult: (result: ReviewResult, text: string, recorded: boolean) => Promise<void>;
  onNext: () => void;
  /** The word card's buttons (only the word card has them). */
  onKnown?: () => void;
  onRemove?: () => void;
  /** A result or a removal is being saved: the word card's buttons are off. */
  busy?: boolean;
}

type Feedback = { result: ReviewResult; text: string; use?: WordCheckReply; skipped?: boolean };

const TYPED = ['spell', 'gap_hint', 'gap', 'collocation', 'form'] as const;
const GAP_TYPES = ['gap_hint', 'gap', 'collocation', 'form'];
// The fill-the-word cards that show the clue line (K5); form has its cue instead.
const CLUE_TYPES = ['gap_hint', 'gap', 'collocation'];
// Cards without a Check button keep Skip on a row of its own (K1).
const SKIP_ALONE = ['choice', 'confusable', 'build'];

function enterKey(e: React.KeyboardEvent, submit: () => void) {
  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault();
    submit();
  }
}

// The character a key press types. On a Russian layout e.key is the Cyrillic letter, so a Latin letter comes from the key's position (e.code).
function typedChar(e: KeyboardEvent): string | null {
  if (/^[a-z]$/i.test(e.key)) return e.key.toLowerCase();
  const letter = /^Key([A-Z])$/.exec(e.code)?.[1];
  if (letter) return letter.toLowerCase();
  return e.key.length === 1 ? e.key.toLowerCase() : null;
}

function Sentence({ text }: { text: string }) {
  return <p className="reading mt-3">{text}</p>;
}

function FeedbackView({ pc, fb, spelling }: { pc: PracticeCard; fb: Feedback; spelling: SpellingVariant }) {
  const { lang } = useCore();
  const ok = fb.result !== 'wrong';
  const { word } = pc;
  return (
    <div className="mt-4 grid gap-4 rounded-md bg-card p-4" aria-live="polite">
      <div className="grid gap-1.5">
        <p className={cn('flex items-center gap-2 font-semibold', ok ? 'text-success' : 'text-destructive')}>
          {ok ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
          {t(lang, ok ? 'words.correct' : 'words.incorrect')}
        </p>
        {fb.text.trim() !== '' && <p className="text-muted-foreground">{t(lang, 'words.yourAnswer', { text: fb.text })}</p>}
      </div>
      <WordCard word={word} lang={lang} spelling={spelling} />
      <div className="grid gap-1.5">
        {fb.skipped && (pc.card.exercise?.answers.length ?? 0) > 0 && (
          <p>{t(lang, 'words.rightAnswer', { text: (pc.card.exercise?.answers ?? []).join(' / ') })}</p>
        )}
        {fb.use && fb.use.wordNote !== '' && <p>{fb.use.wordNote}</p>}
        {fb.use && fb.use.errors.length > 0 && (
          <ul className="grid gap-1">
            {fb.use.errors.map((e, i) => (
              <li key={i}>
                <span className="answer">{e.fragment}</span> → <span className="answer font-semibold text-success">{e.fix}</span>
                {e.explanation !== '' && <span className="text-muted-foreground"> · {e.explanation}</span>}
              </li>
            ))}
          </ul>
        )}
        <p>
          <ExternalLink href={wordLink(word.word, word.link)} className="text-primary underline underline-offset-2">
            {t(lang, 'words.openLink')}
          </ExternalLink>
        </p>
      </div>
    </div>
  );
}

/** The word card of a new word: not a test, so it has no result, no Skip and no Check; Дальше moves on. */
function IntroView({ pc, spelling, busy, onNext, onKnown, onRemove }: {
  pc: PracticeCard; spelling: SpellingVariant; busy: boolean; onNext: () => void; onKnown?: () => void; onRemove?: () => void;
}) {
  const { lang } = useCore();
  const { word } = pc;
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    nextRef.current?.focus();
  }, []);
  return (
    <div data-card-type="intro" className="grid gap-5">
      <WordCard word={word} lang={lang} spelling={spelling} busy={busy} onKnown={onKnown} onRemove={onRemove} />
      <p>
        <ExternalLink href={wordLink(word.word, word.link)} className="text-primary underline underline-offset-2">
          {t(lang, 'words.openLink')}
        </ExternalLink>
      </p>
      <Button
        ref={nextRef}
        className="w-full"
        disabled={busy}
        // Holding Enter must not press Дальше again and again.
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.repeat) e.preventDefault();
        }}
        onClick={onNext}
      >
        {t(lang, 'words.next')}
      </Button>
    </div>
  );
}

/** The letters of a word in slots, one box per letter, grouped per word part with a gap between the parts; `letters` fill the boxes in order. */
function Slots({ word, letters, locked, onReturn }: { word: string; letters: string[]; locked: boolean; onReturn?: (k: number) => void }) {
  const sizes = word.split(' ').filter((p) => p !== '').map((p) => Array.from(p).length);
  let k = 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
      {sizes.map((size, g) => (
        <div key={g} data-testid="slot-group" className="flex flex-wrap gap-1.5">
          {Array.from({ length: size }, () => {
            const i = k++;
            const letter = letters[i];
            if (letter === undefined) {
              return <div key={i} data-testid="slot" className="size-11 rounded-md border-2 border-dashed border-border" />;
            }
            if (onReturn) {
              return (
                <Button key={i} data-testid="placed" variant="secondary" className="answer size-11 p-0 text-xl" disabled={locked} onClick={() => onReturn(i)}>
                  {letter}
                </Button>
              );
            }
            return (
              <div key={i} data-testid="slot" className="answer flex size-11 items-center justify-center rounded-md border-2 border-primary text-xl">
                {letter}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function CardView({ pc, spelling, onResult, onNext, onKnown, onRemove, busy = false }: CardProps) {
  const { deps, lang } = useCore();
  const { card, word } = pc;
  const type = card.type;
  const ex = card.exercise;
  const [text, setText] = useState('');
  const [hinted, setHinted] = useState(false);
  const [retried, setRetried] = useState(false);
  const [almost, setAlmost] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [checking, setChecking] = useState(false);
  const [useError, setUseError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // Anagram and build: the letters placed so far, as indexes into the shuffled tiles, in answer order.
  const [placed, setPlaced] = useState<number[]>([]);
  // Build: mistakes so far, and the tile that flashes after one.
  const [mistakes, setMistakes] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  // The same placed letters and mistakes, set at once, so two quick presses cannot race.
  const placedRef = useRef<number[]>([]);
  const mistakesRef = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = feedback !== null;
  // One result per card, however many times Enter or a button fires before the state catches up.
  const finished = useRef(false);
  const checkingRef = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (feedback && !saving) nextRef.current?.focus();
  }, [feedback, saving]);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const finish = async (fb: Feedback, recorded = false) => {
    if (finished.current) return;
    finished.current = true;
    setFeedback(fb);
    setSaving(true);
    setSaveError(null);
    try {
      await onResult(fb.result, fb.text, recorded);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // Tiles are the letters without the spaces, in the shuffled order; the target is the word's letters in order.
  const tiles = Array.from((pc.letters ?? '').replace(/ /g, ''));
  const target = Array.from(word.word.replace(/ /g, '')).map((ch) => ch.toLowerCase());
  const placedLetters = placed.map((i) => tiles[i] ?? '');
  // An anagram is checked as written, with the spaces put back between the words.
  const typedAnswer = type === 'anagram' ? withSpaces(placedLetters.join(''), word.word) : text;
  const accepted = type === 'anagram' ? [word.word] : type === 'spell' ? spellingsOf(word.word) : (ex?.answers ?? []);
  const correctOption = type === 'choice' ? [word.word] : (ex?.answers ?? []);

  const checkTypedAnswer = () => {
    if (finished.current) return;
    if (typedAnswer.trim() === '') return;
    const verdict = checkTyped(typedAnswer, accepted);
    if (verdict === 'almost' && !retried) {
      setAlmost(true);
      setRetried(true);
      return;
    }
    setAlmost(false);
    void finish({ result: resultFor({ correct: verdict === 'correct', hinted, retried }), text: typedAnswer });
  };

  // A tile is placed or returned in place; the learner rearranges after an Almost (nothing is cleared).
  const placeTile = (i: number) => {
    setPlaced((p) => [...p, i]);
    setAlmost(false);
  };
  const returnTile = (k: number) => {
    setPlaced((p) => p.filter((_, j) => j !== k));
    setAlmost(false);
  };

  useEffect(() => {
    if (type !== 'anagram' || locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key === ' ') return;
      if (e.key === 'Backspace') {
        e.preventDefault();
        setPlaced((p) => p.slice(0, -1));
        setAlmost(false);
      } else if (e.key === 'Enter') {
        // Enter on a focused button presses that button; only the bare card checks.
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        checkTypedAnswer();
      } else {
        const ch = typedChar(e);
        if (ch === null) return;
        setPlaced((p) => {
          const i = tiles.findIndex((l, j) => !p.includes(j) && l.toLowerCase() === ch);
          return i < 0 ? p : [...p, i];
        });
        setAlmost(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => () => {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
  }, []);

  // Build: a tile with the next letter goes into the next slot; any other tile is a mistake and flashes.
  const flashTile = (i: number) => {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    setFlash(i);
    flashTimer.current = setTimeout(() => {
      flashTimer.current = null;
      setFlash(null);
    }, 600);
  };
  const pressBuild = (i: number) => {
    if (finished.current || placedRef.current.includes(i)) return;
    if (tiles[i]?.toLowerCase() === target[placedRef.current.length]) {
      const next = [...placedRef.current, i];
      placedRef.current = next;
      setPlaced(next);
      if (next.length === target.length) {
        void finish({ result: buildResult(mistakesRef.current), text: withSpaces(next.map((j) => tiles[j] ?? '').join(''), word.word) });
      }
      return;
    }
    const m = mistakesRef.current + 1;
    mistakesRef.current = m;
    setMistakes(m);
    flashTile(i);
    if (m >= BUILD_ATTEMPTS) {
      void finish({ result: 'wrong', text: withSpaces(placedRef.current.map((j) => tiles[j] ?? '').join(''), word.word) });
    }
  };

  useEffect(() => {
    if (type !== 'build' || locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || finished.current) return;
      const ch = typedChar(e);
      if (ch === null) return;
      // The first unused tile with this letter; a letter on no unused tile is ignored and costs nothing.
      const i = tiles.findIndex((l, j) => !placedRef.current.includes(j) && l.toLowerCase() === ch);
      if (i >= 0) pressBuild(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const checkTranslated = () => {
    if (finished.current) return;
    if (text.trim() === '') return;
    if (checkTranslation(text, ex?.answers ?? [])) void finish({ result: 'correct', text });
    else setMismatch(true);
  };

  const checkUse = async () => {
    if (finished.current || checkingRef.current || text.trim() === '') return;
    checkingRef.current = true;
    setChecking(true);
    setUseError(null);
    try {
      const res = await checkUseIt(deps, word.id, text.trim());
      if (!res.ok) {
        setUseError(res.message);
        return;
      }
      await finish({ result: res.data.wordOk ? 'correct' : 'wrong', text: text.trim(), use: res.data }, true);
    } catch (e) {
      setUseError(e instanceof Error ? e.message : String(e));
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };

  // Skip counts as a wrong answer: recorded with empty text, so the word gets its extra card.
  const skip = () => {
    if (finished.current) return;
    void finish({ result: 'wrong', text: '', skipped: true });
  };

  const pick = (option: string) => {
    if (feedback || finished.current) return;
    setPicked(option);
    const correct = correctOption.some((a) => normalise(a) === normalise(option));
    void finish({ result: correct ? 'correct' : 'wrong', text: option });
  };

  const hint = () => {
    const first = Array.from(accepted[0] ?? '')[0] ?? '';
    setText(first);
    setHinted(true);
    setAlmost(false);
    inputRef.current?.focus();
  };

  const skipButton = (
    <Button variant="ghost" disabled={checking || saving} onClick={skip}>{t(lang, 'words.skip')}</Button>
  );

  // No hooks below this line: the intro card has no answer of its own.
  if (type === 'intro') {
    return <IntroView pc={pc} spelling={spelling} busy={busy} onNext={onNext} onKnown={onKnown} onRemove={onRemove} />;
  }

  const clue = clueOf(word, lang);
  const instruction =
    type === 'choice' ? t(lang, 'words.instr.choice')
    : type === 'anagram' ? t(lang, 'words.instr.anagram')
    : type === 'build' ? t(lang, 'words.instr.build')
    : type === 'spell' ? t(lang, 'words.instr.spell')
    : type === 'form' ? t(lang, 'words.instr.form', { cue: ex?.cue ?? '' })
    : type === 'confusable' ? t(lang, 'words.instr.confusable')
    : type === 'translation' ? t(lang, 'words.instr.translation')
    : type === 'use' ? t(lang, 'words.instr.use', { word: word.word })
    : t(lang, 'words.instr.gap');

  const typed = (TYPED as readonly string[]).includes(type);
  const options = type === 'choice' || type === 'confusable' ? (pc.options ?? []) : null;

  return (
    <div data-card-type={type}>
      <p className="text-sm text-muted-foreground">{instruction}</p>
      {(type === 'choice' || type === 'anagram' || type === 'build' || type === 'spell') && <p className="reading mt-3">{word.definition}</p>}
      {type === 'spell' && pc.letters !== null && (
        <p className="answer mt-3 flex flex-wrap gap-x-5 text-2xl tracking-[0.4em]" aria-label={pc.letters}>
          {pc.letters.split(' ').filter((g) => g !== '').map((g, i) => <span key={i}>{Array.from(g).join(' ')}</span>)}
        </p>
      )}
      {CLUE_TYPES.includes(type) && clue !== '' && <p className="mt-3 text-muted-foreground">{clue}</p>}
      {GAP_TYPES.includes(type) && ex && <Sentence text={ex.prompt} />}
      {type === 'confusable' && ex && <Sentence text={ex.prompt} />}
      {type === 'translation' && ex && <Sentence text={ex.prompt} />}

      {options && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {options.map((o) => {
            const isRight = correctOption.some((a) => normalise(a) === normalise(o));
            return (
              <Button
                key={o}
                variant="secondary"
                className={cn(
                  'answer justify-start',
                  locked && isRight && 'ring-2 ring-success',
                  locked && picked === o && !isRight && 'ring-2 ring-destructive',
                )}
                disabled={locked}
                onClick={() => pick(o)}
              >
                {o}
              </Button>
            );
          })}
        </div>
      )}

      {(type === 'anagram' || type === 'build') && (
        <div className="mt-4 grid gap-4">
          <Slots word={word.word} letters={placedLetters} locked={locked} onReturn={type === 'anagram' ? returnTile : undefined} />
          <div className="mx-auto flex flex-wrap justify-center gap-2" style={{ maxWidth: 'calc(6 * 2.75rem + 5 * 0.5rem)' }}>
            {tiles.map((ch, i) => (
              <Button
                key={i}
                data-testid="tile"
                variant="outline"
                className={cn('answer h-11 min-w-11 p-0 text-xl', flash === i && 'ring-2 ring-destructive')}
                disabled={locked || placed.includes(i)}
                onClick={() => (type === 'build' ? pressBuild(i) : placeTile(i))}
              >
                {ch}
              </Button>
            ))}
          </div>
          {type === 'build' && !locked && (
            <div data-testid="attempts" className="flex items-center justify-center gap-1.5">
              <span className="sr-only">{t(lang, 'words.attempts', { left: BUILD_ATTEMPTS - mistakes, total: BUILD_ATTEMPTS })}</span>
              {Array.from({ length: BUILD_ATTEMPTS }, (_, k) => {
                const used = k >= BUILD_ATTEMPTS - mistakes;
                return (
                  <span
                    key={k}
                    aria-hidden="true"
                    data-used={used ? 'true' : 'false'}
                    className={cn('size-2.5 rounded-full border border-primary', !used && 'bg-primary')}
                  />
                );
              })}
            </div>
          )}
          {type === 'anagram' && !locked && (
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={typedAnswer.trim() === ''} onClick={checkTypedAnswer}>{t(lang, 'words.check')}</Button>
              {skipButton}
            </div>
          )}
        </div>
      )}

      {(typed || type === 'translation') && (
        <div className="mt-4 grid gap-3">
          <Input
            ref={inputRef}
            className="max-w-sm"
            aria-label={instruction}
            value={text}
            readOnly={locked || mismatch}
            onChange={(e) => {
              setText(e.target.value);
              setAlmost(false);
            }}
            onKeyDown={(e) => enterKey(e, () => (typed ? checkTypedAnswer() : checkTranslated()))}
          />
          {!locked && !mismatch && (
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={text.trim() === ''} onClick={() => (typed ? checkTypedAnswer() : checkTranslated())}>{t(lang, 'words.check')}</Button>
              {typed && type !== 'spell' && (
                <Button variant="ghost" disabled={hinted} onClick={hint}>{t(lang, 'words.hint')}</Button>
              )}
              {skipButton}
            </div>
          )}
        </div>
      )}
      {almost && !locked && <p className="mt-2 text-muted-foreground" aria-live="polite">{t(lang, 'words.almost')}</p>}

      {type === 'translation' && mismatch && !locked && (
        <div className="mt-3 grid gap-3">
          <p>{t(lang, 'words.accepted', { answers: (ex?.answers ?? []).join(' / ') })}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void finish({ result: 'correct', text })}>{t(lang, 'words.right')}</Button>
            <Button variant="secondary" onClick={() => void finish({ result: 'wrong', text })}>{t(lang, 'words.wrong')}</Button>
          </div>
        </div>
      )}

      {type === 'use' && (
        <div className="mt-4 grid gap-3">
          <Textarea
            ref={inputRef}
            aria-label={instruction}
            rows={3}
            value={text}
            readOnly={locked || checking}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => enterKey(e, () => void checkUse())}
          />
          {useError !== null && (
            <Notice>
              <span>{t(lang, 'words.use.error', { message: useError })}</span>
              <Button size="sm" variant="secondary" disabled={checking} onClick={() => void checkUse()}>{t(lang, 'words.retry')}</Button>
            </Notice>
          )}
          {!locked && (
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={checking || text.trim() === ''} onClick={() => void checkUse()}>
                {checking && <LoaderCircle className="animate-spin" aria-hidden />}
                {t(lang, 'words.check')}
              </Button>
              {skipButton}
            </div>
          )}
        </div>
      )}

      {SKIP_ALONE.includes(type) && !locked && (
        <div className="mt-4">{skipButton}</div>
      )}
      {feedback && <FeedbackView pc={pc} fb={feedback} spelling={spelling} />}
      {saveError !== null && <Notice className="mt-3">{t(lang, 'words.saveError', { message: saveError })}</Notice>}
      {feedback && (
        <div className="mt-4">
          <Button ref={nextRef} disabled={saving} onClick={onNext}>{t(lang, 'words.next')}</Button>
        </div>
      )}
    </div>
  );
}
