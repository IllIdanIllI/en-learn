import { t, type Lang } from '@/core/i18n';
import { Pixel } from './Pixel';
import { stalkMeter } from './sprites';

/** Bamboo stalk under the lesson header while answering: one segment per answer field, green once filled. */
export function AnswerMeter({ filled, lang }: { filled: boolean[]; lang: Lang }) {
  if (filled.length === 0) return null;
  const n = filled.filter(Boolean).length;
  return (
    <div data-answer-meter className="mt-6">
      <Pixel rows={stalkMeter(filled.map((f) => (f ? 'ok' : 'empty')))} className="max-w-full" />
      <p className="label tabular mt-1 text-muted-foreground">{t(lang, 'grove.answered', { n, m: filled.length })}</p>
    </div>
  );
}
