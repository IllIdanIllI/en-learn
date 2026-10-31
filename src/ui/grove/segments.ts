import type { SessionView } from '@/core/session/view';

/** One entry per answer field still to be filled, in block order; true once the trimmed text is not empty. */
export function answerSegments(view: SessionView, items: Record<number, string>, spot: Record<string, string>): boolean[] {
  return view.blocks.flatMap((b) => {
    if (b.graded || b.kind === 'speaking' || b.format === 'question') return [];
    if (b.format === 'spot') return b.paragraphs.map((p) => (spot[`${b.id}:${p.index}`] ?? '').trim() !== '');
    return b.items.map((i) => (items[i.id] ?? '').trim() !== '');
  });
}

/** One entry per counted graded item (spot errors included), in block and item order. */
export function scoreSegments(view: SessionView): ('ok' | 'bad')[] {
  return view.blocks.flatMap((b) => {
    if (b.kind === 'speaking' || b.format === 'question') return [];
    const graded = [...b.items, ...b.paragraphs.flatMap((p) => p.errors ?? [])];
    return graded.flatMap((i) => (i.effective == null ? [] : [i.effective === 'correct' ? ('ok' as const) : ('bad' as const)]));
  });
}
