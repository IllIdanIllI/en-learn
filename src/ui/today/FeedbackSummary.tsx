import { t, type Lang } from '@/core/i18n';
import type { SessionView } from '@/core/session/view';

/** Plain text at the top of a graded page: score per block, then Correct, To fix, Tomorrow's review. */
export function FeedbackSummary({ view, lang }: { view: SessionView; lang: Lang }) {
  const scored = view.blocks.filter((b) => b.score && b.score.counted > 0);
  const right = scored.reduce((n, b) => n + (b.score?.correct ?? 0), 0);
  const wrong = scored.reduce((n, b) => n + ((b.score?.counted ?? 0) - (b.score?.correct ?? 0)), 0);
  const patterns = view.feedback?.patterns ?? [];
  const tomorrow = view.feedback?.tomorrow ?? [];
  return (
    <section aria-labelledby="feedback-title" className="mt-8">
      <h2 id="feedback-title" tabIndex={-1} className="title outline-none">{t(lang, 'feedback.title')}</h2>
      <ul className="mt-4 max-w-sm">
        {scored.map((b) => (
          <li key={b.id} className="label tabular flex justify-between gap-6 border-b border-border py-1.5">
            <span className="text-muted-foreground">{b.title}</span>
            <span>{t(lang, 'feedback.score', { correct: b.score!.correct, counted: b.score!.counted })}</span>
          </li>
        ))}
      </ul>

      {right > 0 && (
        <>
          <h3 className="label mt-6 text-muted-foreground">{t(lang, 'feedback.correct')}</h3>
          <p className="reading">{t(lang, 'feedback.rightCount', { n: right })}</p>
        </>
      )}
      {(patterns.length > 0 || wrong > 0) && (
        <>
          <h3 className="label mt-6 text-muted-foreground">{t(lang, 'feedback.fix')}</h3>
          {patterns.length === 0 && <p className="reading">{t(lang, 'feedback.fixCount', { n: wrong })}</p>}
          {patterns.map((p) => (
            <p key={p} className="reading mt-2 rounded-md border border-border bg-input px-4 py-3 italic">{p}</p>
          ))}
        </>
      )}
      {tomorrow.length > 0 && (
        <>
          <h3 className="label mt-6 text-muted-foreground">{t(lang, 'feedback.tomorrow')}</h3>
          <ul className="reading list-disc pl-5">
            {tomorrow.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}
