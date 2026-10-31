import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MoveRefused } from '@/core/dataFolder';
import type { DataLocation } from '@/adapters/tauri/dataFolder';

const fs = vi.hoisted(() => {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const removes: { path: string; recursive: boolean }[] = [];
  const failCopyAt = { n: 0, count: 0 };
  const parent = (p: string) => p.slice(0, p.lastIndexOf('/'));
  const children = (dir: string) => {
    const names = new Map<string, boolean>();
    for (const f of files.keys()) if (parent(f) === dir) names.set(f.slice(dir.length + 1), true);
    for (const d of dirs) if (parent(d) === dir) names.set(d.slice(dir.length + 1), false);
    return names;
  };
  const ensureDir = (d: string) => {
    for (let p = d; p !== ''; p = parent(p)) dirs.add(p);
  };
  const missing = (p: string) => new Error(`no such file or directory: ${p}`);
  return {
    files,
    dirs,
    removes,
    failCopyAt,
    ensureDir,
    exists: async (p: string) => files.has(p) || dirs.has(p),
    mkdir: async (p: string) => ensureDir(p),
    readDir: async (d: string) => {
      if (!dirs.has(d)) throw missing(d);
      return [...children(d)].map(([name, isFile]) => ({ name, isFile, isDirectory: !isFile, isSymlink: false }));
    },
    readTextFile: async (p: string) => {
      if (!files.has(p)) throw missing(p);
      return files.get(p)!;
    },
    writeTextFile: async (p: string, data: string) => {
      files.set(p, data);
    },
    copyFile: async (from: string, to: string) => {
      if (++failCopyAt.count === failCopyAt.n) throw new Error('disk full');
      if (!files.has(from)) throw missing(from);
      files.set(to, files.get(from)!);
    },
    stat: async (p: string) => {
      if (!files.has(p)) throw missing(p);
      return { size: files.get(p)!.length };
    },
    remove: async (p: string, opts?: { recursive?: boolean }) => {
      removes.push({ path: p, recursive: opts?.recursive === true });
      if (files.delete(p)) return;
      if (!dirs.has(p)) throw missing(p);
      if (children(p).size > 0 && !opts?.recursive) throw new Error(`directory not empty: ${p}`);
      for (const f of [...files.keys()]) if (f.startsWith(`${p}/`)) files.delete(f);
      for (const d of [...dirs]) if (d === p || d.startsWith(`${p}/`)) dirs.delete(d);
    },
  };
});
const invoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: fs.exists, mkdir: fs.mkdir, readDir: fs.readDir, readTextFile: fs.readTextFile,
  writeTextFile: fs.writeTextFile, copyFile: fs.copyFile, stat: fs.stat, remove: fs.remove,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

const cur: DataLocation = { appDataDir: '/app/data', appConfigDir: '/app/config', home: '/Users/ann', custom: null };
const picked = '/Users/ann/Documents';
const target = `${picked}/EnglishExamCoach`;
const closeDb = vi.fn(async () => {
  fs.files.delete('/app/config/enlearn.db-wal');
  fs.files.delete('/app/config/enlearn.db-shm');
});
// closing the database drops -wal/-shm by itself, so they are not part of what a rollback must restore
const snapshot = () => ({ files: [...fs.files].filter(([f]) => !/-(wal|shm)$/.test(f)).sort(), dirs: [...fs.dirs].sort() });

beforeEach(() => {
  fs.files.clear();
  fs.dirs.clear();
  fs.removes.length = 0;
  fs.failCopyAt.n = 0;
  fs.failCopyAt.count = 0;
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  closeDb.mockClear();
  for (const d of ['/app/data', '/app/config', '/app/data/prompts', picked]) fs.ensureDir(d);
  fs.files.set('/app/config/enlearn.db', 'database');
  fs.files.set('/app/config/enlearn.db-wal', 'wal');
  fs.files.set('/app/config/enlearn.db-shm', 'shm');
  fs.files.set('/app/config/unrelated.txt', 'keep me');
  fs.files.set('/app/data/prompts/grade.md', 'custom grade prompt');
  fs.files.set('/app/data/notes.txt', 'keep me too');
});

const move = async (from: DataLocation = cur, to = picked) => (await import('@/adapters/tauri/dataFolder')).moveDataDir(from, to, closeDb);

describe('moveDataDir', () => {
  test('copies the files, writes location.json, grants the folder and removes only what was copied', async () => {
    await move();
    expect(fs.files.get(`${target}/enlearn.db`)).toBe('database');
    expect(fs.files.get(`${target}/prompts/grade.md`)).toBe('custom grade prompt');
    expect(fs.files.has(`${target}/enlearn.db-wal`)).toBe(false);
    expect(JSON.parse(fs.files.get('/app/data/location.json')!)).toEqual({ dataDir: target });
    expect(invoke).toHaveBeenCalledWith('grant_data_folder');
    expect(closeDb).toHaveBeenCalledOnce();
    expect([...fs.files.keys()].filter((f) => f.startsWith('/app/')).sort()).toEqual([
      '/app/config/unrelated.txt', '/app/data/location.json', '/app/data/notes.txt',
    ]);
    expect(fs.dirs.has('/app/data/prompts')).toBe(false);
    expect(fs.dirs.has('/app/config')).toBe(true);
    expect(fs.removes.some((r) => r.recursive)).toBe(false);
  });

  test('a rejected grant restores location.json (absent before) and removes everything it created', async () => {
    invoke.mockRejectedValue(new Error('refused'));
    const before = snapshot();
    await expect(move()).rejects.toThrow('refused');
    expect(snapshot()).toEqual(before);
    expect(fs.removes.some((r) => r.recursive)).toBe(false);
  });

  test('a rejected grant puts the previous location.json back', async () => {
    fs.files.set('/app/data/location.json', '{"dataDir":"/old/EnglishExamCoach"}');
    fs.ensureDir('/old/EnglishExamCoach');
    fs.files.set('/old/EnglishExamCoach/enlearn.db', 'database');
    invoke.mockRejectedValue(new Error('refused'));
    const before = snapshot();
    await expect(move({ ...cur, custom: '/old/EnglishExamCoach' })).rejects.toThrow('refused');
    expect(snapshot()).toEqual(before);
  });

  test('a rejected grant keeps a target folder that already existed (empty)', async () => {
    fs.ensureDir(target);
    invoke.mockRejectedValue(new Error('refused'));
    await expect(move()).rejects.toThrow('refused');
    expect(fs.dirs.has(target)).toBe(true);
    expect([...fs.files.keys()].filter((f) => f.startsWith(target))).toEqual([]);
  });

  test('a copy failure midway rolls back: no location.json, no copied files, no created folders', async () => {
    fs.failCopyAt.n = 2;
    const before = snapshot();
    await expect(move()).rejects.toThrow('disk full');
    expect(snapshot()).toEqual(before);
    expect(invoke).not.toHaveBeenCalled();
    expect(fs.removes.some((r) => r.recursive)).toBe(false);
  });

  test('refuses the home folder and volume roots before touching anything', async () => {
    const before = snapshot();
    await expect(move(cur, '/Users/ann')).rejects.toMatchObject({ reason: 'home' });
    await expect(move(cur, '/Volumes/Disk')).rejects.toMatchObject({ reason: 'volume' });
    await expect(move(cur, '/Volumes')).rejects.toBeInstanceOf(MoveRefused);
    expect(snapshot()).toEqual(before);
    expect(closeDb).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});
