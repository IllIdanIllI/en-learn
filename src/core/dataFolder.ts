export type PickRefusal = 'home' | 'root' | 'library' | 'system' | 'volume';
export type MoveRefusal = 'same' | 'inside' | 'occupied' | 'notEmpty' | PickRefusal;
export const DATA_SUBDIR = 'EnglishExamCoach';
export type MovePlan = { ok: true; copies: { from: string; to: string }[] } | { ok: false; reason: MoveRefusal };

const trimSlash = (p: string) => p.replace(/\/+$/, '');

/**
 * Picked-folder refusal rules (the Rust side ports these verbatim).
 * Every path first loses its trailing slashes, so `/` becomes the empty string; comparison is case-sensitive.
 * First match wins:
 *  1. root:    picked is empty (`/`)
 *  2. home:    picked equals home
 *  3. system:  picked equals `/System` or starts with `/System/`
 *  4. volume:  picked is `/Volumes/<name>`, exactly one non-empty segment below `/Volumes`
 *  5. library: picked equals `<home>/Library` or starts with `<home>/Library/`,
 *              unless picked equals appData or starts with `<appData>/`
 * Anything else passes (null).
 */
export function refusePicked(picked: string, home: string, appData: string): PickRefusal | null {
  const p = trimSlash(picked);
  const h = trimSlash(home);
  const app = trimSlash(appData);
  const within = (dir: string) => p === dir || p.startsWith(`${dir}/`);
  if (p === '') return 'root';
  if (p === h) return 'home';
  if (within('/System')) return 'system';
  if (/^\/Volumes\/[^/]+$/.test(p)) return 'volume';
  if (within(`${h}/Library`) && !within(app)) return 'library';
  return null;
}

/** The data always lives in a subfolder of the picked folder. */
export const moveTarget = (picked: string) => `${trimSlash(picked)}/${DATA_SUBDIR}`;

/** What to delete from the old folder: exactly the copied files, then the folders that held them (deepest first), never the `roots` themselves. */
export function cleanupPlan(files: string[], roots: string[]): { files: string[]; dirs: string[] } {
  const dirs = new Set<string>();
  for (const f of files) {
    const root = roots.find((r) => f.startsWith(`${r}/`));
    if (root === undefined) continue;
    for (let d = f.slice(0, f.lastIndexOf('/')); d !== root; d = d.slice(0, d.lastIndexOf('/'))) dirs.add(d);
  }
  const depth = (d: string) => d.split('/').length;
  return { files, dirs: [...dirs].sort((a, b) => depth(b) - depth(a)) };
}

/** `present` holds paths relative to `from`; `occupied` says the target already has a database, `notEmpty` that it already has anything. */
export function planMove(from: string, to: string, present: string[], occupied: boolean, notEmpty = false): MovePlan {
  const src = trimSlash(from);
  const dst = trimSlash(to);
  if (src === dst) return { ok: false, reason: 'same' };
  if (dst.startsWith(`${src}/`)) return { ok: false, reason: 'inside' };
  if (occupied) return { ok: false, reason: 'occupied' };
  if (notEmpty) return { ok: false, reason: 'notEmpty' };
  return { ok: true, copies: present.map((rel) => ({ from: `${src}/${rel}`, to: `${dst}/${rel}` })) };
}

export class MoveRefused extends Error {
  constructor(readonly reason: MoveRefusal) {
    super(`data folder move refused: ${reason}`);
  }
}
