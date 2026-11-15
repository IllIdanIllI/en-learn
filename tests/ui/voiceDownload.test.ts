import { describe, expect, test } from 'vitest';
import { ensureVoiceFiles } from '@/ui/voice/download';
import { VOICE_FILES } from '@/ui/voice/files';
import type { VoiceIo } from '@/ui/voice/io';

const DIR = '/app/voice';

/** An in-memory file system: `files` maps a path to its size; a download writes the bytes it is told to. */
function fakeIo(files: Record<string, number>, opts: { downloadSize?: (path: string, size: number) => number; fail?: (path: string) => boolean } = {}) {
  const fs = new Map(Object.entries(files));
  const downloads: string[] = [];
  const io: VoiceIo = {
    size: async (path) => fs.get(path) ?? null,
    download: async (url, dest, onBytes) => {
      const path = url.slice(url.indexOf('/resolve/') + '/resolve/'.length).replace(/^[^/]+\//, '');
      downloads.push(path);
      const size = VOICE_FILES.find((f) => f.path === path)!.size;
      if (opts.fail?.(path)) {
        fs.set(dest, 100);
        throw new Error('network dropped');
      }
      const written = opts.downloadSize?.(path, size) ?? size;
      fs.set(dest, written);
      onBytes(written);
    },
    rename: async (from, to) => {
      fs.set(to, fs.get(from)!);
      fs.delete(from);
    },
    remove: async (path) => {
      fs.delete(path);
    },
    read: async () => new ArrayBuffer(0),
  };
  return { io, fs, downloads };
}

const complete = () => Object.fromEntries(VOICE_FILES.map((f) => [`${DIR}/${f.path}`, f.size]));

describe('ensureVoiceFiles', () => {
  test('skips files that are already complete', async () => {
    const { io, downloads } = fakeIo(complete());
    await ensureVoiceFiles(io, DIR, () => {});
    expect(downloads).toEqual([]);
  });

  test('a short file and a throwing download leave no .part and rethrow', async () => {
    const short = fakeIo({}, { downloadSize: (_path, size) => size - 1 });
    await expect(ensureVoiceFiles(short.io, DIR, () => {})).rejects.toThrow('wrong size');
    expect([...short.fs.keys()].filter((p) => p.endsWith('.part'))).toEqual([]);
    expect(short.fs.has(`${DIR}/${VOICE_FILES[0]!.path}`)).toBe(false);

    const dropped = fakeIo({}, { fail: (path) => path === VOICE_FILES[0]!.path });
    await expect(ensureVoiceFiles(dropped.io, DIR, () => {})).rejects.toThrow('network dropped');
    expect([...dropped.fs.keys()].filter((p) => p.endsWith('.part'))).toEqual([]);
  });

  test('missing files are all downloaded', async () => {
    const { io, fs, downloads } = fakeIo({});
    await ensureVoiceFiles(io, DIR, () => {});
    expect(downloads).toHaveLength(VOICE_FILES.length);
    expect(fs.get(`${DIR}/voices/af_heart.bin`)).toBe(522240);
  });

  test('onStart is called once, before the first download, when a file is missing', async () => {
    const files = complete();
    delete files[`${DIR}/${VOICE_FILES[0]!.path}`];
    delete files[`${DIR}/${VOICE_FILES[1]!.path}`];
    const { io, downloads } = fakeIo(files);
    const order: string[] = [];
    await ensureVoiceFiles(io, DIR, () => {}, () => {
      order.push('start');
    });
    expect(order).toEqual(['start']);
    expect(downloads).toHaveLength(2);
  });

  test('onStart is never called when every file is complete', async () => {
    const { io } = fakeIo(complete());
    let started = 0;
    await ensureVoiceFiles(io, DIR, () => {}, () => {
      started += 1;
    });
    expect(started).toBe(0);
  });

  test('progress is a fraction of the bytes still to fetch and ends at 1', async () => {
    const files = complete();
    delete files[`${DIR}/${VOICE_FILES[0]!.path}`];
    const { io } = fakeIo(files);
    const seen: number[] = [];
    await ensureVoiceFiles(io, DIR, (f) => seen.push(f));
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((f) => f >= 0 && f <= 1)).toBe(true);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });
});
