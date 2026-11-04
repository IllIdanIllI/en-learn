import { PALETTE, type PixelRows } from './sprites';

/** Decorative pixel sprite: merged horizontal runs as crisp SVG rects. Unknown chars are transparent. */
export function Pixel({ rows, scale = 2, className }: { rows: PixelRows; scale?: number; className?: string }) {
  const w = Math.max(0, ...rows.map((r) => r.length));
  const h = rows.length;
  const rects: React.ReactNode[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x]!;
      const fill = PALETTE[c];
      if (!fill) continue;
      let run = 1;
      while (row[x + run] === c) run++;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={run} height={1} fill={fill} />);
      x += run - 1;
    }
  });
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${w} ${h}`}
      width={w * scale}
      height={h * scale}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {rects}
    </svg>
  );
}
