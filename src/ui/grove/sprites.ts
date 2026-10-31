/** Pure pixel-sprite builders for Night grove. A sprite is rows of palette chars; '.' is transparent. */
export type PixelRows = string[];
export type MeterState = 'ok' | 'bad' | 'empty';

export const PALETTE: Record<string, string> = {
  F: 'var(--px-far)',
  G: 'var(--px-far-node)',
  l: 'var(--px-bamboo-hi)',
  g: 'var(--px-bamboo)',
  h: 'var(--px-bamboo-lo)',
  n: 'var(--px-bamboo-node)',
  f: 'var(--px-leaf)',
  v: 'var(--px-leaf-far)',
  y: 'var(--px-dry)',
  Y: 'var(--px-dry-node)',
  e: 'var(--px-empty)',
  E: 'var(--px-empty-node)',
  s: 'var(--px-wood-hi)',
  d: 'var(--px-wood)',
  k: 'var(--px-wood-lo)',
  r: 'var(--px-strap)',
  o: 'var(--px-empty)',
  m: 'var(--px-moon)',
  M: 'var(--px-moon-lo)',
  w: 'var(--px-glow)',
  t: 'var(--px-stone)',
  T: 'var(--px-stone-lo)',
  L: 'var(--px-light-day)',
  Z: 'var(--firefly)',
};

const grid = (w: number, h: number): string[][] => Array.from({ length: h }, () => Array<string>(w).fill('.'));
const toRows = (g: string[][]): PixelRows => g.map((r) => r.join(''));
const setter = (g: string[][]) => (x: number, y: number, c: string) => {
  const row = g[y];
  if (row && x >= 0 && x < row.length) row[x] = c;
};

type StalkSpec = [x: number, w: number, top: number, gap: number, phase: number];
const GROVE_A: { far: StalkSpec[]; near: StalkSpec[] } = {
  far: [[0.18, 2, 0.3, 10, 3], [0.48, 2, 0.1, 11, 6], [0.72, 2, 0.4, 10, 1], [0.94, 2, 0.2, 11, 4]],
  near: [[0.08, 3, 0.25, 12, 4], [0.3, 4, 0.05, 13, 2], [0.62, 3, 0.35, 12, 7], [0.82, 4, 0.15, 14, 5]],
};

/** Bamboo grove (lookbook option A): far stalks behind, near stalks in front, drooping leaves. Seeded, deterministic. */
export function grove(w: number, h: number): PixelRows {
  const g = grid(w, h);
  const set = setter(g);
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const leaf = (x: number, y: number, dir: number, len: number, c: string) => {
    for (let i = 0; i < len; i++) {
      const yy = y + Math.floor((i * i) / (len * 1.6));
      set(x + dir * i, yy, c);
      if (i > 0 && i < len - 2) set(x + dir * i, yy + 1, c);
    }
  };
  const stalk = (x0: number, sw: number, top: number, gap: number, phase: number, far: boolean) => {
    const leafC = far ? 'v' : 'f';
    for (let y = top; y < h; y++) {
      const node = (y - phase) % gap === 0;
      for (let i = 0; i < sw; i++) {
        const c = far ? (node ? 'G' : 'F') : node ? 'n' : i === 0 ? 'l' : i === sw - 1 ? 'h' : 'g';
        set(x0 + i, y, c);
      }
      if (node && !far) {
        set(x0 - 1, y, 'n');
        set(x0 + sw, y, 'n');
      }
      if (node && y > top + 4 && y < h - 14 && rnd() > 0.35) {
        const dir = rnd() > 0.5 ? 1 : -1;
        const lx = dir > 0 ? x0 + sw : x0 - 1;
        leaf(lx, y, dir, 6 + Math.floor(rnd() * 6), leafC);
        if (rnd() > 0.5) leaf(lx, y + 2, dir, 4 + Math.floor(rnd() * 4), leafC);
      }
    }
    leaf(x0 + sw, top + 1, 1, 6, leafC);
    leaf(x0 - 1, top + 2, -1, 5, leafC);
  };
  GROVE_A.far.forEach(([x, sw, t, gp, ph]) => stalk(Math.round(w * x), sw, Math.round(h * t), gp, ph, true));
  GROVE_A.near.forEach(([x, sw, t, gp, ph]) => stalk(Math.round(w * x), sw, Math.round(h * t), gp, ph, false));
  return toRows(g);
}

/** Yotsume-gaki: a low fence of dried bamboo, posts tied to two rails. */
export function fence(w: number): PixelRows {
  const h = 20;
  const g = grid(w, h);
  const set = setter(g);
  for (let x = 0; x < w; x++) {
    set(x, 6, 'y');
    set(x, 7, 'Y');
    set(x, 13, 'y');
    set(x, 14, 'Y');
  }
  for (let x = 3; x < w - 1; x += 12) {
    for (let y = 1; y < h; y++) {
      set(x, y, 'y');
      set(x + 1, y, y % 6 === 0 ? 'Y' : 'y');
    }
    set(x, 0, 'Y');
    set(x + 1, 0, 'Y');
    for (const ry of [6, 13]) {
      set(x - 1, ry, 'k');
      set(x + 2, ry + 1, 'k');
      set(x, ry + 1, 'k');
      set(x + 1, ry, 'k');
    }
  }
  return toRows(g);
}

/** Takenoko: a bamboo shoot. */
export const SHOOT: PixelRows = ['...f...', '..ffd..', '..dsd..', '.ddsdd.', '.dsdkd.', 'ddsdddk', 'dddkddk'];

const TORO: PixelRows = [
  '....tttt....',
  '..tttttttt..',
  'tttttttttttt',
  '..TwwwwwwT..',
  '..TwwmmwwT..',
  '..TwwwwwwT..',
  '.TTTTTTTTTT.',
  '....tTTt....',
  '....tTTt....',
  '....tTTt....',
  '...tttTTt...',
  '..tTTTTTTt..',
];
/** Stone lantern; unlit swaps the light for stone-dark. */
export const lantern = (lit: boolean): PixelRows => (lit ? [...TORO] : TORO.map((r) => r.replace(/[wm]/g, 'E')));

/** Moon phase, phase in 0..1 (0 new, 0.5 full). The dark part is drawn faint so the disc reads. */
export function moon(phase: number, r = 5): PixelRows {
  const n = 2 * r + 1;
  const g = grid(n, n);
  const k = Math.cos(2 * Math.PI * phase);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x - r;
      const dy = y - r;
      if (dx * dx + dy * dy > r * r + 0.5) continue;
      const hw = Math.sqrt(Math.max(0, r * r - dy * dy));
      const lit = phase < 0.5 ? dx > k * hw : dx <= -k * hw;
      g[y]![x] = lit ? 'm' : 'E';
    }
  }
  return toRows(g);
}

/** Side-view geta: board, two teeth, strap loop at the toe. */
export const GETA: PixelRows = [
  '......rrr.............',
  '.....r...rr...........',
  '....r......rr.........',
  '....r........r........',
  '.ssssssssssssssssssss.',
  'dddddddddddddddddddddd',
  '.dddddddddddddddddddd.',
  '...kkk..........kkk...',
  '...kkk..........kkk...',
  '...kkk..........kkk...',
];

/** Single bamboo leaf (heading marker) and its dry twin. */
export const LEAF: PixelRows = ['......ff', '....fff.', '..ffff..', '.fff....', 'ff......'];
export const DRY_LEAF: PixelRows = LEAF.map((r) => r.replace(/f/g, 'y'));

/** Thin pale bamboo divider spanning `cols`. */
export function divider(cols: number): PixelRows {
  const g = grid(cols, 4);
  for (let x = 0; x < cols; x++) {
    g[1]![x] = 'F';
    g[2]![x] = 'F';
  }
  for (let x = 0; x < cols; x += 26) for (let y = 0; y < 4; y++) g[y]![x] = 'G';
  const set = setter(g);
  const mid = Math.floor(cols / 2);
  for (const [dx, dy] of [[0, 1], [1, 2], [2, 3], [3, 3]] as const) set(mid + dx + 1, dy, 'v');
  return toRows(g);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Horizontal bamboo, one segment per state. Width is exactly n * (seg + 1) + 1; the leaf sits above the stalk. */
export function stalkMeter(states: MeterState[], maxCols = 300): PixelRows {
  const n = states.length;
  const seg = clamp(Math.floor((maxCols - 1) / Math.max(n, 1)) - 1, 3, 9);
  const w = n * (seg + 1) + 1;
  const g = grid(w, 9); // rows 0-1 leaf, 2-6 stalk
  const set = setter(g);
  const body: Record<MeterState, [string, string, string]> = { ok: ['l', 'g', 'h'], bad: ['y', 'y', 'Y'], empty: ['e', 'e', 'E'] };
  states.forEach((s, i) => {
    const x0 = i * (seg + 1) + 1;
    const [hi, mid, lo] = body[s];
    for (let x = x0; x < x0 + seg; x++) {
      set(x, 4, hi);
      set(x, 5, mid);
      set(x, 6, lo);
    }
  });
  for (let i = 0; i <= n; i++) {
    const x = i * (seg + 1);
    const prev = states[i - 1];
    const next = states[i];
    const c = prev === 'ok' || next === 'ok' ? 'n' : prev === 'bad' || next === 'bad' ? 'Y' : 'E';
    for (let y = 3; y <= 7; y++) set(x, y, c);
  }
  const lastOk = states.lastIndexOf('ok');
  if (lastOk >= 0) {
    const x = (lastOk + 1) * (seg + 1); // the node; leaf sits over the segment to its left
    for (const lx of [x - 3, x - 2, x - 1]) set(lx, 1, 'f');
    set(x - 2, 0, 'f');
    set(x - 1, 0, 'f');
  }
  return toRows(g);
}
