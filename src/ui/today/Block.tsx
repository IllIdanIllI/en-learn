import { t, type Lang } from '@/core/i18n';
import { useCore } from '@/ui/app/CoreProvider';
import { Pixel } from '@/ui/grove/Pixel';
import { divider, LEAF } from '@/ui/grove/sprites';
import type { ViewBlock } from '@/core/session/view';

/** A heading plus its content, separated by space: no card. `hideTitle` leaves out the heading line (an added round). */
export function Block({ block, number, lang, hideTitle = false, divider: withDivider = false, children }: {
  block: ViewBlock; number: number; lang: Lang; hideTitle?: boolean; divider?: boolean; children: React.ReactNode;
}) {
  const grove = useCore().settings.design === 'grove';
  return (
    <section aria-labelledby={hideTitle ? undefined : `block-${block.id}`} className="mt-12">
      {grove && withDivider && (
        <div data-divider className="mb-12"><Pixel rows={divider(336)} className="h-auto max-w-full" /></div>
      )}
      {!hideTitle && (
        <div className="flex items-baseline justify-between gap-4">
          <h2 id={`block-${block.id}`} className="title">
            {grove && <Pixel rows={LEAF} className="mr-2 inline-block" />}<span className="tabular">{number}.</span> {block.title}
          </h2>
          <span className="label tabular shrink-0 text-faint">{t(lang, 'today.minutes', { n: block.minutes })}</span>
        </div>
      )}
      <p className="mt-2 text-muted-foreground">{block.format === 'spot' ? t(lang, 'spot.hint') : block.instruction}</p>
      {block.format !== 'spot' && block.kind !== 'writing' && block.formatExample && (
        <p className="answer mt-2 inline-block rounded-sm bg-input px-2.5 py-1 text-foreground">{block.formatExample}</p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  );
}
