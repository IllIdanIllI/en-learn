import { describe, expect, it } from 'vitest';
import { clipKey, createClipStore } from '../../src/ui/voice/clipStore';
import type { ClipIo } from '../../src/ui/voice/clipStore';

const DIR = '/data/voice/clips';
const CAP = 1024 * 1024;

/** In-memory ClipIo; `files` holds bytes and `modified` per full path. */
function fakeIo() {
  const files = new Map<string, { bytes: ArrayBuffer; modified: number }>();
  const removed: string[] = [];
  let clock = 1;
  const io: ClipIo & { failRead: boolean; failWrite: boolean } = {
    failRead: false,
    failWrite: false,
    async read(path) {
      if (io.failRead) throw new Error('boom read');
      return files.get(path)?.bytes ?? null;
    },
    async write(path, bytes) {
      if (io.failWrite) throw new Error('boom write');
      files.set(path, { bytes, modified: clock++ });
    },
    async remove(path) {
      removed.push(path);
      files.delete(path);
    },
    async list(dir) {
      return [...files.entries()]
        .filter(([p]) => p.startsWith(`${dir}/`))
        .map(([p, f]) => ({ name: p.slice(dir.length + 1), size: f.bytes.byteLength, modified: f.modified }));
    },
  };
  return { io, files, removed };
}

function clip(n: number, rate = 24000) {
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.sin(i / 7) * 0.9;
  return { pcm, rate };
}

/** A file of `samples` int16 samples (4 header bytes + 2 each). */
function raw(samples: number, rate = 24000): ArrayBuffer {
  const buf = new ArrayBuffer(4 + samples * 2);
  new DataView(buf).setUint32(0, rate, true);
  return buf;
}

describe('clipKey', () => {
  it('is 32 hex chars, stable, and differs by revision, voice and text', async () => {
    const a = await clipKey('r1', 'v1', 'hello');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await clipKey('r1', 'v1', 'hello')).toBe(a);
    expect(await clipKey('r2', 'v1', 'hello')).not.toBe(a);
    expect(await clipKey('r1', 'v2', 'hello')).not.toBe(a);
    expect(await clipKey('r1', 'v1', 'hello!')).not.toBe(a);
  });
});

describe('createClipStore', () => {
  it('round-trips a clip within 1/32767 per sample, with the same rate', async () => {
    const { io } = fakeIo();
    const store = createClipStore(io, DIR, CAP, () => undefined);
    const c = clip(500, 22050);
    await store.put('k', c);
    const back = await store.get('k');
    expect(back?.rate).toBe(22050);
    expect(back?.pcm.length).toBe(500);
    for (let i = 0; i < 500; i++) expect(Math.abs((back?.pcm[i] ?? 9) - (c.pcm[i] ?? 0))).toBeLessThanOrEqual(1 / 32767);
  });

  it('returns null for an unknown key', async () => {
    const { io } = fakeIo();
    const store = createClipStore(io, DIR, CAP, () => undefined);
    expect(await store.get('nope')).toBeNull();
  });

  it('returns null for odd-length, too-short and zero-rate files', async () => {
    const { io, files } = fakeIo();
    const odd = new ArrayBuffer(4 + 3);
    new DataView(odd).setUint32(0, 24000, true);
    files.set(`${DIR}/odd.s16`, { bytes: odd, modified: 1 });
    files.set(`${DIR}/short.s16`, { bytes: new ArrayBuffer(3), modified: 2 });
    files.set(`${DIR}/zero.s16`, { bytes: raw(4, 0), modified: 3 });
    const store = createClipStore(io, DIR, CAP, () => undefined);
    expect(await store.get('odd')).toBeNull();
    expect(await store.get('short')).toBeNull();
    expect(await store.get('zero')).toBeNull();
  });

  it('returns null and logs when a read throws', async () => {
    const { io } = fakeIo();
    io.failRead = true;
    const logs: string[] = [];
    const store = createClipStore(io, DIR, CAP, (t) => logs.push(t));
    expect(await store.get('k')).toBeNull();
    expect(logs).toContain('clip read failed boom read');
  });

  it('removes the oldest file when a put goes past the cap and keeps the new one', async () => {
    const { io, removed } = fakeIo();
    const size = 4 + 100 * 2;
    const store = createClipStore(io, DIR, size * 2, () => undefined);
    await store.put('a', clip(100));
    await store.put('b', clip(100));
    await store.put('c', clip(100));
    expect(removed).toEqual([`${DIR}/a.s16`]);
    expect(await store.get('a')).toBeNull();
    expect(await store.get('b')).not.toBeNull();
    expect(await store.get('c')).not.toBeNull();
  });

  it('removes already listed files oldest first', async () => {
    const { io, files, removed } = fakeIo();
    const size = 4 + 100 * 2;
    files.set(`${DIR}/new.s16`, { bytes: raw(100), modified: 300 });
    files.set(`${DIR}/old.s16`, { bytes: raw(100), modified: 100 });
    files.set(`${DIR}/mid.s16`, { bytes: raw(100), modified: 200 });
    const store = createClipStore(io, DIR, size * 2, () => undefined);
    await store.put('fresh', clip(100));
    expect(removed).toEqual([`${DIR}/old.s16`, `${DIR}/mid.s16`]);
    expect(await store.get('fresh')).not.toBeNull();
    expect(await store.get('new')).not.toBeNull();
  });

  it('keeps the new clip even when it alone is over the cap', async () => {
    const { io, removed } = fakeIo();
    const store = createClipStore(io, DIR, 10, () => undefined);
    await store.put('big', clip(100));
    expect(removed).toEqual([]);
    expect(await store.get('big')).not.toBeNull();
  });

  it('does not throw and logs when a write throws', async () => {
    const { io } = fakeIo();
    io.failWrite = true;
    const logs: string[] = [];
    const store = createClipStore(io, DIR, CAP, (t) => logs.push(t));
    await expect(store.put('k', clip(10))).resolves.toBeUndefined();
    expect(logs).toContain('clip save failed boom write');
  });

  it('treats a failing list as empty and logs it', async () => {
    const { io } = fakeIo();
    io.list = async () => {
      throw new Error('boom list');
    };
    const logs: string[] = [];
    const store = createClipStore(io, DIR, CAP, (t) => logs.push(t));
    expect(await store.get('k')).toBeNull();
    expect(logs.length).toBeGreaterThan(0);
  });
});
