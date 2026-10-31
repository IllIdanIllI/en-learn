// Small pixel details (2px pixels): bamboo grove, bamboo meter, side-view geta. Colours from CSS variables.
(function () {
  const PAL = {
    F: 'var(--px-far)', // far stalks (faded)
    G: 'var(--px-far-node)',
    l: 'var(--px-bamboo-hi)',
    g: 'var(--px-bamboo)',
    h: 'var(--px-bamboo-lo)',
    n: 'var(--px-bamboo-node)',
    f: 'var(--px-leaf)',
    v: 'var(--px-leaf-far)',
    y: 'var(--px-dry)', // dry bamboo (wrong / to fix)
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
  };

  function svg(rows, scale, cls = 'px') {
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    let rects = '';
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (!PAL[c]) continue;
        let run = 1;
        while (row[x + run] === c) run++;
        rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${PAL[c]}"/>`;
        x += run - 1;
      }
    });
    return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }
  const grid = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));

  /** A small grove: far stalks behind, near stalks in front, drooping leaves at some nodes. Deterministic. */
  function grove(W = 96, H = 120, scale = 2, spec = null) {
    const g = grid(W, H);
    const set = (x, y, c, overwrite = true) => { if (x >= 0 && x < W && y >= 0 && y < H && (overwrite || g[y][x] === '.')) g[y][x] = c; };
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const leaf = (x, y, dir, len, c) => {
      // Droops: goes out, then down; 2px thick in the middle, 1px at the tip.
      for (let i = 0; i < len; i++) {
        const yy = y + Math.floor((i * i) / (len * 1.6));
        set(x + dir * i, yy, c);
        if (i > 0 && i < len - 2) set(x + dir * i, yy + 1, c);
      }
    };
    const stalk = (x0, w, top, gap, phase, far) => {
      for (let y = top; y < H; y++) {
        const node = (y - phase) % gap === 0;
        for (let i = 0; i < w; i++) {
          let c;
          if (far) c = node ? 'G' : 'F';
          else c = node ? 'n' : i === 0 ? 'l' : i === w - 1 ? 'h' : 'g';
          set(x0 + i, y, c);
        }
        if (node && !far) { set(x0 - 1, y, 'n'); set(x0 + w, y, 'n'); }
        if (node && y > top + 4 && y < H - 14 && rnd() > 0.35) {
          const dir = rnd() > 0.5 ? 1 : -1;
          const lx = dir > 0 ? x0 + w : x0 - 1;
          leaf(lx, y, dir, 6 + Math.floor(rnd() * 6), far ? 'v' : 'f');
          if (rnd() > 0.5) leaf(lx, y + 2, dir, 4 + Math.floor(rnd() * 4), far ? 'v' : 'f');
        }
      }
      // Tip: a few leaves at the top
      leaf(x0 + w, top + 1, 1, 6, far ? 'v' : 'f'); leaf(x0 - 1, top + 2, -1, 5, far ? 'v' : 'f');
    };
    const T = (f) => Math.round(H * f);
    const X = (f) => Math.round(W * f);
    const sp = spec || {
      far: [[0.12, 2, 0.22, 11, 3], [0.4, 2, 0.04, 12, 7], [0.66, 2, 0.18, 10, 1], [0.88, 2, 0.34, 11, 5]],
      near: [[0.05, 4, 0.16, 14, 6], [0.27, 3, 0.02, 13, 2], [0.55, 4, 0.3, 15, 9], [0.77, 3, 0.46, 12, 4]],
    };
    sp.far.forEach(([x, w, t, gp, ph]) => stalk(X(x), w, T(t), gp, ph, true));
    sp.near.forEach(([x, w, t, gp, ph]) => stalk(X(x), w, T(t), gp, ph, false));
    return svg(g.map((r) => r.join('')), scale);
  }

  /** Horizontal bamboo: one segment per item. states: 'ok' green, 'bad' dry, 'empty' faint. */
  function stalkMeter(states, seg = 9, scale = 2) {
    const W = states.length * (seg + 1) + 1;
    const H = 7;
    const g = grid(W, H);
    const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
    states.forEach((s, i) => {
      const x0 = i * (seg + 1) + 1;
      const [hi, mid, lo] = s === 'ok' ? ['l', 'g', 'h'] : s === 'bad' ? ['y', 'y', 'Y'] : ['e', 'e', 'E'];
      for (let x = x0; x < x0 + seg; x++) { set(x, 2, hi); set(x, 3, mid); set(x, 4, lo); }
    });
    for (let i = 0; i <= states.length; i++) {
      const x = i * (seg + 1);
      const prev = states[i - 1], next = states[i];
      const c = prev === 'ok' || next === 'ok' ? 'n' : prev === 'bad' || next === 'bad' ? 'Y' : 'E';
      for (let y = 1; y <= 5; y++) set(x, y, c);
    }
    // a leaf sprouting from the last green node
    const lastOk = states.lastIndexOf('ok');
    if (lastOk >= 0) { const x = (lastOk + 1) * (seg + 1); set(x + 1, 0, 'f'); set(x + 2, 0, 'f'); set(x + 3, 0, 'f'); set(x + 1, 1, 'f'); set(x + 2, 1, 'f'); }
    return svg(g.map((r) => r.join('')), scale);
  }

  // Side-view geta: board, two teeth, strap loop at the toe.
  const GETA = [
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
  const OUTLINE = [
    '......................',
    '......................',
    '......................',
    '......................',
    '.oooooooooooooooooooo.',
    'o....................o',
    '.oooooooooooooooooooo.',
    '...o.o..........o.o...',
    '...o.o..........o.o...',
    '...ooo..........ooo...',
  ];
  function geta(scale = 2, filled = true) { return svg(filled ? GETA : OUTLINE, scale); }

    /** Pixel crescent moon. */
  function moon(scale = 2) {
    const R = 7, N = 2 * R + 1; const g = grid(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const a = Math.hypot(x - R, y - R) <= R; const b = Math.hypot(x - R - 4, y - R + 3) <= R - 1;
      if (a && !b) g[y][x] = Math.hypot(x - R, y - R) > R - 1.5 ? 'M' : 'm';
    }
    return svg(g.map((r) => r.join('')), scale);
  }
  /** Stone lantern (toro) with a warm light. */
  const TORO = [
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
  function toro(scale = 2) { return svg(TORO, scale); }
  /** Single bamboo leaf (heading marker). */
  const LEAF = ['......ff', '....fff.', '..ffff..', '.fff....', 'ff......'];
  function leaf(scale = 2) { return svg(LEAF, scale); }
  /** Thin horizontal bamboo divider spanning `cols`. */
  function divider(cols = 300, scale = 2) {
    const g = grid(cols, 4);
    for (let x = 0; x < cols; x++) { g[1][x] = 'F'; g[2][x] = 'F'; }
    for (let x = 0; x < cols; x += 26) { g[0][x] = 'G'; g[1][x] = 'G'; g[2][x] = 'G'; g[3][x] = 'G'; }
    const mid = Math.floor(cols / 2); [[0, 1], [1, 2], [2, 3], [3, 3]].forEach(([dx, dy]) => { if (g[dy]) g[dy][mid + dx + 1] = 'v'; });
    return svg(g.map((r) => r.join('')), scale);
  }
  /** 100 days as 10 bamboo stalks of 10 segments; states: 'on' | 'light' | 'off'. Oldest at the bottom-left. */
  function regularity(states, scale = 2) {
    const SEG = 4, SW = 4, GAP = 4; const W = 10 * (SW + GAP), H = 10 * (SEG + 1) + 1; const g = grid(W, H);
    for (let i = 0; i < 100; i++) {
      const col = Math.floor(i / 10), seg = i % 10; const x0 = col * (SW + GAP) + 2; const yb = H - 1 - seg * (SEG + 1);
      const st = states[i] || 'off'; const body = st === 'on' ? ['l', 'g', 'g', 'h'] : st === 'light' ? ['L', 'L', 'L', 'L'] : ['e', 'e', 'e', 'e'];
      const node = st === 'on' ? 'n' : st === 'light' ? 'L' : 'E';
      for (let y = yb - SEG; y < yb; y++) for (let k = 0; k < SW; k++) g[y][x0 + k] = body[k];
      for (let k = -1; k <= SW; k++) if (x0 + k >= 0 && x0 + k < W) g[yb][x0 + k] = node;
    }
    return svg(g.map((r) => r.join('')), scale);
  }
  /** Yotsume-gaki: a low garden fence of dried bamboo, posts tied to two rails. */
  function fence(W = 100, scale = 2) {
    const H = 20; const g = grid(W, H);
    const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
    for (let x = 0; x < W; x++) { set(x, 6, 'y'); set(x, 7, 'Y'); set(x, 13, 'y'); set(x, 14, 'Y'); }
    for (let x = 3; x < W - 1; x += 12) {
      for (let y = 1; y < H; y++) { set(x, y, 'y'); set(x + 1, y, y % 6 === 0 ? 'Y' : 'y'); }
      set(x, 0, 'Y'); set(x + 1, 0, 'Y');
      [6, 13].forEach((ry) => { set(x - 1, ry, 'k'); set(x + 2, ry + 1, 'k'); set(x, ry + 1, 'k'); set(x + 1, ry, 'k'); });
    }
    return svg(g.map((r) => r.join('')), scale);
  }
  /** A bamboo branch hanging from the top right, leaves drooping. */
  function branch(W = 100, H = 46, scale = 2) {
    const g = grid(W, H);
    const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
    const pts = [];
    for (let i = 0; i < W * 0.7; i++) { const x = W - 1 - i; const y = Math.floor((i * i) / (W * 3.2)); pts.push([x, y]); set(x, y, 'h'); if (i % 14 === 0) set(x, y + 1, 'n'); }
    const hang = (x, y, len, lean) => { for (let i = 0; i < len; i++) { const xx = x - Math.floor((i * lean) / 4); const yy = y + Math.floor(i * 0.8); set(xx, yy, 'f'); if (i > 1 && i < len - 3) set(xx + 1, yy, 'f'); } };
    const at = [6, 13, 17, 26, 31, 38, 47, 52, 60];
    at.forEach((i, k) => { if (!pts[i]) return; const [x, y] = pts[i]; hang(x, y + 1, 9 + ((k * 5) % 7), 3 + (k % 3) * 2); if (k % 2 === 0) hang(x + 2, y + 1, 6 + (k % 4), 1 + (k % 2)); });
    return svg(g.map((r) => r.join('')), scale);
  }
  /** Takenoko: a bamboo shoot. */
  const SHOOT = ['...f...', '..ffd..', '..dsd..', '.ddsdd.', '.dsdkd.', 'ddsdddk', 'dddkddk'];
  function shoot(scale = 2) { return svg(SHOOT, scale); }
  /** Moon phase, p in 0..1 (0 new, 0.5 full). The dark part is drawn faint so the disc reads. */
  function moonPhase(p, R = 5, scale = 2) {
    const N = 2 * R + 1; const g = grid(N, N); const k = Math.cos(2 * Math.PI * p);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - R, dy = y - R; if (dx * dx + dy * dy > R * R + 0.5) continue;
      const hw = Math.sqrt(Math.max(0, R * R - dy * dy));
      const lit = p < 0.5 ? dx > k * hw : dx < -k * hw;
      g[y][x] = lit ? 'm' : 'E';
    }
    return svg(g.map((r) => r.join('')), scale);
  }
  function phaseOf(dateStr) { const d = Date.parse(dateStr + 'T20:00:00Z'); const ref = Date.parse('2000-01-06T18:14:00Z'); const syn = 29.530588853; return (((d - ref) / 86400000) % syn + syn) % syn / syn; }
  /** Tiny leaf for chips: green or dry. */
  function chipLeaf(dry = false, scale = 2) { const c = dry ? 'y' : 'f'; return svg(['...' + c + c, '.' + c + c + c + '.', c + c + '...'], scale); }
  /** Stone lantern, lit or unlit. */
  function toro2(lit = true, scale = 2) { return svg(lit ? TORO : TORO.map((r) => r.replace(/[wm]/g, 'E')), scale); }
  window.PX4 = { grove, stalkMeter, geta, moon, toro, toro2, leaf, divider, fence, branch, shoot, moonPhase, phaseOf, chipLeaf };
})();
