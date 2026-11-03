import { t, type Lang } from '@/core/i18n';
import type { ViewBlock } from '@/core/session/view';
import { countWords, errorRate, markFragments, TARGET_WORDS } from '@/core/writing/text';
import { Textarea } from '@/ui/components/ui/textarea';
import { GradedItem } from './GradedItem';

/** The text with each error fragment underlined. */
function Marked({ text, fragments }: { text: string; fragments: string[] }) {
  return (
    <p className="reading whitespace-pre-wrap">
      {markFragments(text, fragments).map((run, i) =>
        run.error ? (
          <span key={i} data-error className="underline decoration-destructive decoration-2 underline-offset-4">{run.text}</span>
        ) : (
          run.text
        ),
      )}
    </p>
  );
}

/** "N errors · R per 100 words", or the note that the text was too short to check. */
function RateLine({ errors, words, lang }: { errors: number; words: number; lang: Lang }) {
  const rate = errorRate(errors, words);
  return <p className="label tabular mt-3 text-muted-foreground">{rate === null ? t(lang, 'writing.tooShort') : t(lang, 'writing.rate', { errors, rate })}</p>;
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
    <>
      <Marked text={w.text} fragments={wrong.map((i) => i.answer?.text ?? '')} />
      <RateLine errors={wrong.length} words={w.words ?? 0} lang={lang} />
    </>
  );
  return (
    <div className="flex flex-col gap-6">
      {source ? (
        <div className="grid gap-8 min-[900px]:grid-cols-2">
          <div>
            <h3 className="label mb-2 text-muted-foreground">{t(lang, 'writing.before')}</h3>
            <Marked text={source.text} fragments={source.errors.map((e) => e.was)} />
            <RateLine errors={source.errors.length} words={countWords(source.text)} lang={lang} />
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
    </div>
  );
}
