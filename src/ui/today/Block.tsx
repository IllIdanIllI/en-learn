import { t, type Lang } from '@/core/i18n';
import type { ViewBlock } from '@/core/session/view';

/** A heading plus its content, separated by space: no card. */
export function Block({ block, number, lang, children }: { block: ViewBlock; number: number; lang: Lang; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`block-${block.id}`} className="mt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={`block-${block.id}`} className="title">
          <span className="tabular">{number}.</span> {block.title}
        </h2>
        <span className="label tabular shrink-0 text-faint">{t(lang, 'today.minutes', { n: block.minutes })}</span>
      </div>
      <p className="mt-2 text-muted-foreground">{block.instruction}</p>
      {block.formatExample && (
        <p className="answer mt-2 inline-block rounded-sm bg-input px-2.5 py-1 text-foreground">{block.formatExample}</p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  );
}
