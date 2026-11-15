import { t, type Lang } from '@/core/i18n';
import type { ViewBlock } from '@/core/session/view';
import type { ErrorKind, TextAssessment, TextStrength } from '@/core/llm/types';
import { countWords, errorRate, kindCounts, markText, overallBand, TARGET_WORDS } from '@/core/writing/text';
import { Textarea } from '@/ui/components/ui/textarea';
import { GradedItem } from './GradedItem';

/** The text with each error fragment underlined and each strong fragment marked with a green dotted underline. */
function Marked({ text, fragments, strengths }: { text: string; fragments: string[]; strengths: string[] }) {
  return (
    <p className="reading whitespace-pre-wrap">
      {markText(text, fragments, strengths).map((run, i) =>
        run.error ? (
          <span key={i} data-error className="underline decoration-destructive decoration-2 underline-offset-4">{run.text}</span>
        ) : run.strength ? (
          <span key={i} data-strength className="underline decoration-success decoration-dotted decoration-2 underline-offset-4">{run.text}</span>
        ) : (
          run.text
        ),
      )}
    </p>
  );
}

const CRITERIA = ['taskResponse', 'coherence', 'vocabulary', 'grammar'] as const;

/** The approximate IELTS band, the four criteria with their notes, and the disclaimer. */
function Evaluation({ assessment, lang }: { assessment: TextAssessment; lang: Lang }) {
  return (
    <div data-testid="writing-evaluation" className="mb-4">
      <p className="answer tabular font-semibold">{t(lang, 'writing.band', { band: overallBand(assessment).toFixed(1) })}</p>
      <dl className="reading mt-2 grid grid-cols-[auto_auto_1fr] gap-x-4 gap-y-1">
        {CRITERIA.map((c) => (
          <div key={c} className="col-span-3 grid grid-cols-subgrid">
            <dt>{t(lang, `writing.criterion.${c}`)}</dt>
            <dd className="tabular font-semibold">{assessment[c].band.toFixed(1)}</dd>
            <dd className="text-muted-foreground">{assessment[c].note}</dd>
          </div>
        ))}
      </dl>
      <p className="label mt-2 text-muted-foreground">{t(lang, 'writing.bandNote')}</p>
    </div>
  );
}

/** "N errors · R per 100 words", or the note that the text was too short to check. */
function RateLine({ errors, words, lang }: { errors: number; words: number; lang: Lang }) {
  const rate = errorRate(errors, words);
  return <p className="label tabular mt-3 text-muted-foreground">{rate === null ? t(lang, 'writing.tooShort') : t(lang, 'writing.rate', { errors, rate })}</p>;
}

/**
 * A checked text: the evaluation (when it has one), the text with its errors and strong parts marked, the rate line,
 * and the error counts by type (when the errors have kinds). Read-only; the error list is the caller's.
 */
export function WritingResult({ text, fragments, words, lang, assessment = null, strengths = [], kinds = [] }: {
  text: string; fragments: string[]; words: number; lang: Lang;
  assessment?: TextAssessment | null; strengths?: TextStrength[]; kinds?: (ErrorKind | null)[];
}) {
  const counts = kindCounts(kinds);
  return (
    <>
      {assessment && <Evaluation assessment={assessment} lang={lang} />}
      <Marked text={text} fragments={fragments} strengths={strengths.map((s) => s.fragment)} />
      <RateLine errors={fragments.length} words={words} lang={lang} />
      {counts.length > 0 && (
        <p data-testid="writing-kinds" className="label tabular mt-1 text-muted-foreground">
          {counts.map((c) => `${t(lang, `writing.errorKind.${c.kind}`)} ${c.count}`).join(' · ')}
        </p>
      )}
    </>
  );
}

/** The strong parts of a text, each fragment in quotes with its note; nothing when there are none. Goes after the error list. */
export function WritingStrengths({ strengths, lang }: { strengths: TextStrength[]; lang: Lang }) {
  if (strengths.length === 0) return null;
  return (
    <div data-testid="writing-strengths" className="mt-6">
      <h3 className="label text-muted-foreground">{t(lang, 'writing.strengths')}</h3>
      <ul className="reading mt-2 flex flex-col gap-2">
        {strengths.map((s, i) => (
          <li key={i}>
            <span className="font-semibold">«{s.fragment}»</span> <span className="text-muted-foreground">{s.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * An essay or a rewrite: an editor with a word count until the text is checked, then the text with its errors
 * underlined, the error list (graded items, so disputes work) and the rate. A rewrite also shows the text it started from.
 */
export function WritingBlock({ block, lang, value, onChange }: {
  block: ViewBlock; lang: Lang; value: string; onChange: (value: string) => void;
}) {
  const w = block.writing;
  if (!w) return null;
  const { source } = w;
  if (w.text === null) {
    return (
      <div className="flex flex-col gap-4">
        {source && (
          <div>
            <p className="label text-muted-foreground">{t(lang, 'writing.sourceErrors')}</p>
            <ul className="answer mt-2 flex flex-col gap-1">
              {source.errors.map((e, i) => (
                <li key={i}><span className="text-muted-foreground">{e.was}</span> → <span className="font-semibold text-success">{e.fix}</span></li>
              ))}
            </ul>
          </div>
        )}
        <Textarea
          aria-label={t(lang, 'writing.label')}
          value={value}
          rows={14}
          className="reading min-h-72 max-w-none [font-family:var(--font-serif)]"
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="label tabular text-faint">{t(lang, 'writing.words', { n: countWords(value), target: TARGET_WORDS })}</p>
      </div>
    );
  }

  const wrong = block.items.filter((i) => i.effective === 'wrong');
  const mine = (
    <WritingResult
      text={w.text} fragments={wrong.map((i) => i.answer?.text ?? '')} words={w.words ?? 0} lang={lang}
      assessment={w.assessment} strengths={w.strengths} kinds={wrong.map((i) => i.errorKind)}
    />
  );
  return (
    <div className="flex flex-col gap-6">
      {source ? (
        <div className="grid gap-8 min-[900px]:grid-cols-2">
          <div>
            <h3 className="label mb-2 text-muted-foreground">{t(lang, 'writing.before')}</h3>
            <WritingResult text={source.text} fragments={source.errors.map((e) => e.was)} words={countWords(source.text)} lang={lang} strengths={source.strengths} />
          </div>
          <div>
            <h3 className="label mb-2 text-muted-foreground">{t(lang, 'writing.after')}</h3>
            {mine}
          </div>
        </div>
      ) : (
        <div>{mine}</div>
      )}
      {block.items.length > 0 && (
        <ol className="flex flex-col gap-3">
          {block.items.map((item, i) => <GradedItem key={item.id} item={item} number={i + 1} lang={lang} />)}
        </ol>
      )}
      <WritingStrengths strengths={w.strengths} lang={lang} />
    </div>
  );
}
