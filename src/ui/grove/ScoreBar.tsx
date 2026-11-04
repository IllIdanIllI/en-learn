import { t, type Lang } from '@/core/i18n';
import type { SessionView } from '@/core/session/view';
import { Pixel } from './Pixel';
import { scoreSegments } from './segments';
import { stalkMeter } from './sprites';

/** Feedback summary: big N / M, the line "Correct N of M", and a bamboo stalk with a segment per counted item. */
export function ScoreBar({ view, lang }: { view: SessionView; lang: Lang }) {
  const states = scoreSegments(view);
  if (states.length === 0) return null;
  const n = states.filter((s) => s === 'ok').length;
  return (
    <div data-score-bar className="mt-4">
      <p className="title grove-score tabular">{n} / {states.length}</p>
      <p className="label text-muted-foreground">{t(lang, 'grove.correct', { n, m: states.length })}</p>
      <Pixel rows={stalkMeter(states)} className="mt-2 max-w-full" />
    </div>
  );
}
