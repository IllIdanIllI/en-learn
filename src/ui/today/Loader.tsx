import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { t, type Lang } from '@/core/i18n';
import type { GenStage } from '@/core/session/generate';
import type { WaitTip } from '@/core/progress/tips';

export type LoaderStage = GenStage | 'grading';
export type LoaderView = {
  stages: readonly LoaderStage[]; current: LoaderStage; attempt: number; estimateMs: number | null; tips: WaitTip[];
};

export const GENERATION_STAGES: readonly LoaderStage[] = ['writing', 'checking', 'saving'];
export const GRADING_STAGES: readonly LoaderStage[] = ['grading'];

const TICK_MS = 1000;
const TIP_MS = 6000;
/** The bar stops short of full until the job is actually done. */
const CAP = 0.95;

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Waiting state of a model job: its stages, time left against the estimate, and a tip card. */
export function Loader({ lang, stages, current, attempt, estimateMs, tips }: LoaderView & { lang: Lang }) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (tips.length < 2) return;
    const id = setInterval(() => setTipIndex((i) => i + 1), TIP_MS);
    return () => clearInterval(id);
  }, [tips.length]);

  const elapsed = now - startedAt;
  const estimate = estimateMs !== null && estimateMs > 0 ? estimateMs : null;
  const share = estimate === null ? 0 : Math.min(elapsed / estimate, CAP);
  const currentIndex = stages.indexOf(current);
  const tip = tips.length > 0 ? tips[tipIndex % tips.length] : undefined;

  let eta = '';
  if (estimate !== null) {
    const left = estimate - elapsed;
    eta = left > 0 ? t(lang, 'loader.left', { s: Math.ceil(left / 1000) }) : t(lang, 'loader.longer');
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/* Only the stages are announced; the ticking clock stays silent. */}
      <div role="status">
        <ol className="flex flex-col gap-1.5">
          {stages.map((stage, i) => {
            const isCurrent = i === currentIndex;
            const color = i < currentIndex ? 'text-muted-foreground' : isCurrent ? 'text-foreground' : 'text-faint';
            return (
              <li key={stage} aria-current={isCurrent ? 'step' : undefined} className={`flex items-center gap-2 ${color}`}>
                <span className="flex size-4 items-center justify-center">
                  {i < currentIndex && <Check aria-hidden className="size-4" />}
                </span>
                <span>{t(lang, `loader.${stage}`)}</span>
                {isCurrent && attempt > 1 && <span className="text-muted-foreground">· {t(lang, 'loader.attempt', { n: attempt })}</span>}
              </li>
            );
          })}
        </ol>
      </div>
      {estimate !== null && (
        <div aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-input">
          <div
            className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-linear"
            style={{ width: `${share * 100}%` }}
          />
        </div>
      )}
      <div aria-live="off" className="tabular flex justify-between text-muted-foreground">
        <span>{eta}</span>
        <span>{clock(elapsed)}</span>
      </div>
      {tip !== undefined && (
        <section aria-live="off" className="rounded-md bg-card p-4">
          <h3 className="label text-muted-foreground">{t(lang, 'loader.tip')}</h3>
          <p className="answer mt-2">{tip.was} → {tip.should}</p>
        </section>
      )}
    </div>
  );
}
