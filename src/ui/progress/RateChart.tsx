import { t, type Lang } from '@/core/i18n';
import { RATE_TARGET } from '@/core/writing/text';

const W = 640;
const H = 220;
const PAD = { top: 12, right: 40, bottom: 28, left: 32 };

/**
 * Errors per 100 words, one point per checked text, oldest first. The target is a dashed line. Plain SVG, as in
 * DESIGN.md "Metric": a primary line, faint gridlines, the target in muted ink.
 */
export function RateChart({ points, lang }: { points: { date: string; rate: number }[]; lang: Lang }) {
  const max = Math.max(RATE_TARGET, ...points.map((p) => p.rate));
  const step = Math.max(1, Math.ceil(max / 4));
  const yMax = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => (points.length === 1 ? PAD.left + innerW / 2 : PAD.left + (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH * (1 - v / yMax);
  const targetY = y(RATE_TARGET);
  const firstDate = points[0]?.date ?? '';
  const lastDate = points.at(-1)?.date ?? '';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t(lang, 'progress.rate')}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
          <text x={PAD.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[11px] tabular-nums">{v}</text>
        </g>
      ))}
      <line x1={PAD.left} x2={W - PAD.right} y1={targetY} y2={targetY} className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="4 4" />
      <text data-testid="rate-target" x={W - PAD.right + 6} y={targetY} dominantBaseline="middle" className="fill-muted-foreground text-[11px] tabular-nums">{RATE_TARGET}</text>
      {points.length > 1 && (
        <polyline
          fill="none"
          className="stroke-primary"
          strokeWidth={1.5}
          strokeLinejoin="round"
          points={points.map((p, i) => `${x(i)},${y(p.rate)}`).join(' ')}
        />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.rate)} r={3} className="fill-primary">
          <title>{`${p.date} · ${p.rate}`}</title>
        </circle>
      ))}
      <text x={x(0)} y={H - 8} textAnchor={points.length === 1 ? 'middle' : 'start'} className="fill-muted-foreground text-[11px] tabular-nums">{firstDate}</text>
      {points.length > 1 && (
        <text x={x(points.length - 1)} y={H - 8} textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">{lastDate}</text>
      )}
    </svg>
  );
}
