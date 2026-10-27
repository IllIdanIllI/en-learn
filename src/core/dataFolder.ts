export type MoveRefusal = 'same' | 'inside' | 'occupied';
export type MovePlan = { ok: true; copies: { from: string; to: string }[] } | { ok: false; reason: MoveRefusal };

const trimSlash = (p: string) => p.replace(/\/+$/, '');

/** `present` holds paths relative to `from`; `occupied` says the target already has a database. */
export function planMove(from: string, to: string, present: string[], occupied: boolean): MovePlan {
  const src = trimSlash(from);
  const dst = trimSlash(to);
  if (src === dst) return { ok: false, reason: 'same' };
  if (dst.startsWith(`${src}/`)) return { ok: false, reason: 'inside' };
  if (occupied) return { ok: false, reason: 'occupied' };
  return { ok: true, copies: present.map((rel) => ({ from: `${src}/${rel}`, to: `${dst}/${rel}` })) };
}

export class MoveRefused extends Error {
  constructor(readonly reason: MoveRefusal) {
    super(`data folder move refused: ${reason}`);
  }
}
