import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createKokoroEngine, type VoiceEngine } from '@/ui/voice/engine';
import { VOICE_FILES } from '@/ui/voice/files';
import type { VoiceIo } from '@/ui/voice/io';

type Msg = { type: string; id?: number; text?: string; voice?: string; prefetch?: boolean; files?: Record<string, ArrayBuffer> };

/** A worker that records what it is sent; the test drives its replies through `reply`. */
class FakeWorker {
  posted: Msg[] = [];
  terminated = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessageerror: ((e: unknown) => void) | null = null;
  postMessage(msg: Msg) {
    this.posted.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    this.onmessage?.({ data });
  }
  request(): Msg {
    return this.posted.filter((m) => m.type === 'speak').at(-1)!;
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const pcm = (n: number) => Float32Array.of(n);

let workers: FakeWorker[];
let spoken: { text: string; variant: string }[];
let cancels: number;
let plays: { first: number; rate: number }[];
let ends: (() => void)[];
let logs: [string, string][];
let speakingNow: boolean;
let stops: number;
let unlocks: number;
let sizeCalls: number;
let canSpeakNow: boolean;

/** Every file is already on disk, so a press goes straight to loading. */
function completeIo(): VoiceIo {
  return {
    size: async (path) => {
      sizeCalls += 1;
      return VOICE_FILES.find((f) => path === `/app/voice/${f.path}`)!.size;
    },
    download: async () => {},
    rename: async () => {},
    remove: async () => {},
    read: async () => new ArrayBuffer(8),
  };
}

function makeEngine(io: VoiceIo = completeIo()): VoiceEngine {
  return createKokoroEngine({
    io,
    dir: '/app/voice',
    makeWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w as unknown as Worker;
    },
    system: {
      canSpeak: () => canSpeakNow,
      speak: (text, variant) => spoken.push({ text, variant }),
      cancel: () => {
        cancels += 1;
      },
      speaking: () => speakingNow,
    },
    play: (samples, rate, onEnd) => {
      plays.push({ first: samples[0]!, rate });
      ends.push(onEnd);
      return {
        stop: () => {
          stops += 1;
        },
      };
    },
    unlock: () => {
      unlocks += 1;
    },
    log: (kind, text) => {
      logs.push([kind, text]);
    },
  });
}

/** The model file is missing, so the first press downloads it; `fractions` are the progress steps the download reports. */
function downloadingIo(fractions: number[]): VoiceIo {
  const model = VOICE_FILES[0]!;
  const io = completeIo();
  const written = new Set<string>();
  return {
    ...io,
    size: async (path) => {
      if (path === `/app/voice/${model.path}`) return null;
      if (path === `/app/voice/${model.path}.part`) return written.has(path) ? model.size : null;
      return io.size(path);
    },
    download: async (_url, dest, onBytes) => {
      for (const f of fractions) onBytes(Math.round(f * model.size));
      written.add(dest);
    },
  };
}

/** An engine whose model is loaded: the first press fell back to the system voice and the init reply came. */
async function readyEngine(): Promise<VoiceEngine> {
  const engine = makeEngine();
  engine.speak('warm up', 'en-GB');
  await flush();
  workers[0]!.reply({ type: 'ready' });
  return engine;
}

beforeEach(() => {
  workers = [];
  spoken = [];
  cancels = 0;
  plays = [];
  ends = [];
  logs = [];
  speakingNow = false;
  stops = 0;
  unlocks = 0;
  sizeCalls = 0;
  canSpeakNow = true;
});

describe('KokoroEngine', () => {
  test('the first press falls back to the system voice and the engine is ready after the init reply', async () => {
    const engine = makeEngine();
    expect(engine.status()).toBe('idle');
    engine.speak('lucid', 'en-GB');
    expect(spoken).toEqual([{ text: 'lucid', variant: 'en-GB' }]);
    await flush();
    expect(engine.status()).toBe('loading');
    const init = workers[0]!.posted[0]!;
    expect(init.type).toBe('init');
    expect(Object.keys(init.files!).sort()).toEqual(VOICE_FILES.map((f) => f.path).sort());
    workers[0]!.reply({ type: 'ready' });
    expect(engine.status()).toBe('ready');
    expect(plays).toEqual([]);
  });

  test('a second press posts the text and plays the reply', async () => {
    const engine = await readyEngine();
    engine.speak('ephemeral', 'en-GB');
    expect(workers[0]!.request()).toMatchObject({ type: 'speak', text: 'ephemeral', voice: 'bf_emma' });
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(1), rate: 24000 });
    await flush();
    expect(plays).toEqual([{ first: 1, rate: 24000 }]);
  });

  test('the variant picks the voice: en-US is af_heart, en-GB is bf_emma', async () => {
    const engine = await readyEngine();
    engine.speak('x', 'en-US');
    expect(workers[0]!.request().voice).toBe('af_heart');
    engine.speak('y', 'en-GB');
    expect(workers[0]!.request().voice).toBe('bf_emma');
  });

  test('two quick presses play only the second reply', async () => {
    const engine = await readyEngine();
    engine.speak('first', 'en-US');
    const first = workers[0]!.request().id;
    engine.speak('second', 'en-US');
    const second = workers[0]!.request().id;
    workers[0]!.reply({ type: 'audio', id: first, pcm: pcm(1), rate: 24000 });
    workers[0]!.reply({ type: 'audio', id: second, pcm: pcm(2), rate: 24000 });
    await flush();
    expect(plays).toEqual([{ first: 2, rate: 24000 }]);
  });

  test('a press stops the audio still playing and cancels system speech', async () => {
    const engine = await readyEngine();
    engine.speak('one', 'en-US');
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(1), rate: 24000 });
    await flush();
    const before = cancels;
    engine.speak('two', 'en-US');
    expect(stops).toBe(1);
    expect(cancels).toBe(before + 1);
  });

  test('stop before the reply: nothing plays', async () => {
    const engine = await readyEngine();
    engine.speak('lucid', 'en-US');
    const id = workers[0]!.request().id;
    engine.stop();
    workers[0]!.reply({ type: 'audio', id, pcm: pcm(1), rate: 24000 });
    await flush();
    expect(plays).toEqual([]);
  });

  test('a cached text plays at once without posting', async () => {
    const engine = await readyEngine();
    engine.speak('lucid', 'en-US');
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(1), rate: 24000 });
    await flush();
    const posts = workers[0]!.posted.length;
    engine.speak('lucid', 'en-US');
    expect(plays).toHaveLength(2);
    expect(workers[0]!.posted).toHaveLength(posts);
  });

  test('prefetch then speak of the same text posts once and plays once', async () => {
    const engine = await readyEngine();
    engine.prefetch('ephemeral', 'en-US');
    expect(workers[0]!.posted.filter((m) => m.type === 'speak')).toHaveLength(1);
    engine.speak('ephemeral', 'en-US');
    expect(workers[0]!.posted.filter((m) => m.type === 'speak')).toHaveLength(1);
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(1), rate: 24000 });
    await flush();
    expect(plays).toHaveLength(1);
  });

  test('prefetch does nothing before the model is ready', () => {
    const engine = makeEngine();
    engine.prefetch('lucid', 'en-US');
    expect(workers).toEqual([]);
  });

  test('an init error means failed; a press after a start failure does not start again, retry does', async () => {
    const engine = makeEngine();
    engine.speak('lucid', 'en-GB');
    await flush();
    workers[0]!.reply({ type: 'error', message: 'no wasm' });
    expect(engine.status()).toBe('failed');
    engine.speak('lucid', 'en-GB');
    expect(spoken).toHaveLength(2);
    await flush();
    expect(engine.status()).toBe('failed');
    expect(workers).toHaveLength(1);
    engine.retry();
    await flush();
    expect(engine.status()).toBe('loading');
    expect(workers).toHaveLength(2);
  });

  test('a speak error from the worker keeps the engine ready, and that press keeps the system voice', async () => {
    const engine = await readyEngine();
    engine.speak('lucid', 'en-US');
    workers[0]!.reply({ type: 'error', id: workers[0]!.request().id, message: 'bad input' });
    expect(engine.status()).toBe('ready');
    await flush();
    expect(plays).toEqual([]);
    expect(spoken.at(-1)).toEqual({ text: 'lucid', variant: 'en-US' });
  });

  test('after a failed sentence the next press posts to the same worker and plays', async () => {
    const engine = await readyEngine();
    engine.speak('broken', 'en-US');
    workers[0]!.reply({ type: 'error', id: workers[0]!.request().id, message: 'bad input' });
    engine.speak('lucid', 'en-US');
    expect(workers).toHaveLength(1);
    expect(workers[0]!.request()).toMatchObject({ text: 'lucid', prefetch: false });
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(3), rate: 24000 });
    await flush();
    expect(plays).toEqual([{ first: 3, rate: 24000 }]);
  });

  test('a failed prefetch is retried by the next press for that text', async () => {
    const engine = await readyEngine();
    engine.prefetch('broken', 'en-US');
    workers[0]!.reply({ type: 'error', id: workers[0]!.request().id, message: 'bad input' });
    engine.speak('broken', 'en-US');
    expect(workers[0]!.posted.filter((m) => m.type === 'speak')).toHaveLength(2);
  });

  test('prefetches are posted with the prefetch flag, presses without it', async () => {
    const engine = await readyEngine();
    engine.prefetch('ephemeral', 'en-US');
    engine.speak('lucid', 'en-US');
    const [prefetched, pressed] = workers[0]!.posted.filter((m) => m.type === 'speak');
    expect(prefetched).toMatchObject({ text: 'ephemeral', prefetch: true });
    expect(pressed).toMatchObject({ text: 'lucid', prefetch: false });
  });

  test('without system speech, a press does not call the system voice', async () => {
    canSpeakNow = false;
    const engine = await readyEngine();
    engine.speak('lucid', 'en-US');
    engine.stop();
    expect(spoken).toEqual([]);
    expect(cancels).toBe(0);
  });

  test('an interrupted download means failed, and the next presses retry until one completes', async () => {
    let downloadCalls = 0;
    const onDisk = new Map<string, number>();
    const io: VoiceIo = {
      size: async (path) => onDisk.get(path) ?? null,
      download: async (url, dest, onBytes) => {
        downloadCalls += 1;
        if (downloadCalls <= 2) throw new Error('network dropped');
        const path = url.slice(url.indexOf('/resolve/') + '/resolve/'.length).replace(/^[^/]+\//, '');
        const size = VOICE_FILES.find((f) => f.path === path)!.size;
        onDisk.set(dest, size);
        onBytes(size);
      },
      rename: async (from, to) => {
        onDisk.set(to, onDisk.get(from)!);
        onDisk.delete(from);
      },
      remove: async (path) => {
        onDisk.delete(path);
      },
      read: async () => new ArrayBuffer(8),
    };
    const engine = makeEngine(io);

    engine.speak('first', 'en-GB');
    await flush();
    expect(engine.status()).toBe('failed');
    expect(workers).toHaveLength(0);
    expect(spoken).toEqual([{ text: 'first', variant: 'en-GB' }]);

    engine.speak('second', 'en-GB');
    await flush();
    expect(downloadCalls).toBe(2);
    expect(engine.status()).toBe('failed');
    expect(workers).toHaveLength(0);
    expect(spoken.at(-1)).toEqual({ text: 'second', variant: 'en-GB' });

    engine.speak('third', 'en-GB');
    await flush();
    expect(engine.status()).toBe('loading');
    expect(spoken.at(-1)).toEqual({ text: 'third', variant: 'en-GB' });
    workers[0]!.reply({ type: 'ready' });
    expect(engine.status()).toBe('ready');
    expect(plays).toEqual([]);
  });

  test('a press unlocks audio synchronously', () => {
    const engine = makeEngine();
    engine.speak('lucid', 'en-GB');
    expect(unlocks).toBe(1);
  });

  test('a press before ready logs system-not-ready', () => {
    const engine = makeEngine();
    engine.speak('pivotal', 'en-GB');
    expect(logs).toContainEqual(['voice', 'press "pivotal" en-GB system-not-ready']);
  });

  test('a ready press logs kokoro-wait, then the clip start with a 20-character outline', async () => {
    const engine = await readyEngine();
    engine.speak('pivotal', 'en-GB');
    expect(logs).toContainEqual(['voice', 'press "pivotal" en-GB kokoro-wait']);
    const clip = new Float32Array(24000);
    clip[0] = 0.5;
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: clip, rate: 24000 });
    await flush();
    expect(logs.at(-1)).toEqual(['voice', `play "pivotal" 24000 samples 24000Hz 1.00s #${'.'.repeat(19)} system=no clip=no`]);
  });

  test('the clip start line says system=yes when the system voice was speaking at the press', async () => {
    const engine = await readyEngine();
    speakingNow = true;
    engine.speak('pivotal', 'en-GB');
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(1), rate: 24000 });
    await flush();
    expect(logs.at(-1)![1]).toMatch(/ system=yes clip=no$/);
  });

  test('a second press of the same text logs kokoro-cached', async () => {
    const engine = await readyEngine();
    engine.speak('pivotal', 'en-GB');
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(1), rate: 24000 });
    await flush();
    engine.speak('pivotal', 'en-GB');
    expect(logs).toContainEqual(['voice', 'press "pivotal" en-GB kokoro-cached']);
  });

  test('clip=yes means a previous clip was still playing at the press', async () => {
    const engine = await readyEngine();
    engine.speak('first', 'en-US');
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(1), rate: 24000 });
    await flush();
    engine.speak('second', 'en-US');
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(2), rate: 24000 });
    await flush();
    expect(stops).toBe(1);
    expect(logs.at(-1)![1]).toMatch(/ system=no clip=yes$/);
  });

  test('the end callback logs end, and a press after it says clip=no', async () => {
    const engine = await readyEngine();
    engine.speak('pivotal', 'en-GB');
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(1), rate: 24000 });
    await flush();
    ends[0]!();
    expect(logs.at(-1)).toEqual(['voice', 'end "pivotal"']);
    engine.speak('pivotal', 'en-GB');
    expect(logs.at(-1)![1]).toMatch(/ clip=no$/);
  });

  test('a stopped clip still logs its end, but does not clear the mark of the clip that replaced it', async () => {
    const engine = await readyEngine();
    engine.speak('first', 'en-US');
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(1), rate: 24000 });
    await flush();
    engine.speak('second', 'en-US');
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(2), rate: 24000 });
    await flush();
    ends[0]!();
    expect(logs.at(-1)).toEqual(['voice', 'end "first"']);
    engine.speak('third', 'en-US');
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(3), rate: 24000 });
    await flush();
    expect(logs.at(-1)![1]).toMatch(/ clip=yes$/);
  });

  test('a cached press made after the previous clip ended logs clip=no, one made during playback logs clip=yes', async () => {
    const engine = await readyEngine();
    engine.speak('pivotal', 'en-GB');
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(1), rate: 24000 });
    await flush();
    ends[0]!();
    engine.speak('pivotal', 'en-GB');
    expect(logs.at(-1)![1]).toMatch(/ system=no clip=no$/);
    engine.speak('pivotal', 'en-GB');
    expect(logs.at(-1)![1]).toMatch(/ system=no clip=yes$/);
  });

  test('clip=yes is read at the press, not when a late reply starts the clip', async () => {
    const engine = await readyEngine();
    engine.speak('first', 'en-US');
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(1), rate: 24000 });
    await flush();
    engine.speak('second', 'en-US');
    ends[0]!();
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(2), rate: 24000 });
    await flush();
    expect(logs.at(-1)![1]).toMatch(/ clip=yes$/);
  });

  test('a throwing deps.play leaves no playing mark and rethrows', async () => {
    let boom = false;
    const engine = createKokoroEngine({
      io: completeIo(),
      dir: '/app/voice',
      makeWorker: () => {
        const w = new FakeWorker();
        workers.push(w);
        return w as unknown as Worker;
      },
      system: { canSpeak: () => true, speak: () => {}, cancel: () => {}, speaking: () => false },
      play: (_s, _r, onEnd) => {
        if (boom) throw new Error('no audio');
        ends.push(onEnd);
        return { stop: () => {} };
      },
      log: (kind, text) => logs.push([kind, text]),
    });
    engine.speak('warm up', 'en-GB');
    await flush();
    workers[0]!.reply({ type: 'ready' });
    engine.speak('a', 'en-US');
    workers[0]!.reply({ type: 'audio', id: workers[0]!.request().id, pcm: pcm(1), rate: 24000 });
    await flush();
    boom = true;
    expect(() => engine.speak('a', 'en-US')).toThrow('no audio');
    boom = false;
    engine.speak('a', 'en-US');
    expect(logs.at(-1)![1]).toMatch(/ clip=no$/);
  });

  test('a speaking() that throws still plays the clip and logs system=no', async () => {
    const throwing = createKokoroEngine({
      io: completeIo(),
      dir: '/app/voice',
      makeWorker: () => {
        const w = new FakeWorker();
        workers.push(w);
        return w as unknown as Worker;
      },
      system: {
        canSpeak: () => true,
        speak: () => {},
        cancel: () => {},
        speaking: () => {
          throw new Error('no speechSynthesis');
        },
      },
      play: (samples, rate, onEnd) => {
        plays.push({ first: samples[0]!, rate });
        ends.push(onEnd);
        return { stop: () => {} };
      },
      log: (kind, text) => logs.push([kind, text]),
    });
    throwing.speak('warm up', 'en-GB');
    await flush();
    const w = workers.at(-1)!;
    w.reply({ type: 'ready' });
    throwing.speak('pivotal', 'en-GB');
    w.reply({ type: 'audio', id: w.request().id, pcm: pcm(1), rate: 24000 });
    await flush();
    expect(plays).toHaveLength(1);
    expect(logs.at(-1)![1]).toMatch(/ system=no clip=no$/);
  });

  test('stop logs stop', async () => {
    const engine = await readyEngine();
    engine.stop();
    expect(logs.at(-1)).toEqual(['voice', 'stop']);
  });

  test('a rejected request logs system-fallback', async () => {
    const engine = await readyEngine();
    engine.speak('lucid', 'en-US');
    workers[0]!.reply({ type: 'error', id: workers[0]!.request().id, message: 'bad input' });
    await flush();
    expect(logs).toContainEqual(['voice', 'press "lucid" en-US system-fallback']);
  });

  test('a worker error logs its first 200 characters', async () => {
    const engine = await readyEngine();
    engine.speak('lucid', 'en-US');
    workers[0]!.reply({ type: 'error', id: workers[0]!.request().id, message: 'x'.repeat(300) });
    expect(logs).toContainEqual(['voice', `error ${'x'.repeat(200)}`]);
  });

  test('a failed load logs error once, then status failed', async () => {
    const engine = makeEngine();
    engine.speak('lucid', 'en-GB');
    await flush();
    workers[0]!.reply({ type: 'error', message: 'no wasm' });
    const texts = logs.map(([, text]) => text);
    expect(texts.filter((t) => t.startsWith('error '))).toEqual(['error no wasm']);
    expect(texts.at(-1)).toBe('status failed');
  });

  test('a failed download logs error once, then status failed', async () => {
    const io: VoiceIo = {
      ...completeIo(),
      size: async () => null,
      download: async () => {
        throw new Error('network down');
      },
    };
    const engine = makeEngine(io);
    engine.speak('lucid', 'en-GB');
    await flush();
    const texts = logs.map(([, text]) => text);
    expect(texts.filter((t) => t.startsWith('error '))).toEqual(['error network down']);
    expect(texts.at(-1)).toBe('status failed');
    expect(texts.indexOf('error network down')).toBeLessThan(texts.indexOf('status failed'));
  });

  test('download progress logs each 10% step once, and no 0%', async () => {
    const engine = makeEngine(downloadingIo([0.05, 0.12, 0.13, 0.31]));
    engine.speak('pivotal', 'en-GB');
    await flush();
    const percent = logs.map(([, text]) => text).filter((text) => text.startsWith('status downloading '));
    expect(percent.filter((text) => text === 'status downloading 10%')).toHaveLength(1);
    expect(percent.filter((text) => text === 'status downloading 30%')).toHaveLength(1);
    expect(percent).not.toContain('status downloading 0%');
    expect(percent).not.toContain('status downloading 13%');
  });

  test('a download of the model logs the status changes in order', async () => {
    const engine = makeEngine(downloadingIo([0.5]));
    engine.speak('pivotal', 'en-GB');
    await flush();
    const statuses = logs.map(([, text]) => text).filter((text) => text.startsWith('status ') && !text.includes('%'));
    expect(statuses).toEqual(['status downloading', 'status loading']);
  });

  test('with every file on disk the statuses seen are loading, ready', async () => {
    const engine = makeEngine();
    const seen: string[] = [];
    engine.subscribe(() => seen.push(engine.status()));
    engine.speak('lucid', 'en-GB');
    await flush();
    workers[0]!.reply({ type: 'ready' });
    expect(seen).toEqual(['loading', 'ready']);
  });

  test('a missing file shows downloading while it downloads, then loading', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const base = downloadingIo([0.5]);
    const engine = makeEngine({
      ...base,
      download: async (url, dest, onBytes) => {
        await gate;
        await base.download(url, dest, onBytes);
      },
    });
    engine.speak('pivotal', 'en-GB');
    await flush();
    expect(engine.status()).toBe('downloading');
    release();
    await flush();
    expect(engine.status()).toBe('loading');
  });

  test('a press during the file checks starts no second load', async () => {
    const engine = makeEngine();
    engine.speak('lucid', 'en-GB');
    engine.speak('lucid', 'en-GB');
    await flush();
    expect(sizeCalls).toBe(VOICE_FILES.length);
    expect(workers).toHaveLength(1);
  });

  test('a failed download sets lastError to its message, and the next load clears it', async () => {
    const base = completeIo();
    const engine = makeEngine({
      ...base,
      size: async (path) => (path === `/app/voice/${VOICE_FILES[0]!.path}` ? null : base.size(path)),
      download: async () => {
        throw new Error('HTTP 500');
      },
    });
    expect(engine.lastError()).toBeNull();
    engine.speak('pivotal', 'en-GB');
    await flush();
    expect(engine.status()).toBe('failed');
    expect(engine.lastError()).toBe('HTTP 500');
    engine.speak('pivotal', 'en-GB');
    expect(engine.lastError()).toBeNull();
  });
});

describe('KokoroEngine start steps and time limit', () => {
  /** Lets every pending promise run; the fake clock does not move. */
  async function settle() {
    for (let i = 0; i < 50; i++) await Promise.resolve();
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('a start logs each file read, the worker creation and the init, and the worker step lines', async () => {
    const engine = makeEngine();
    engine.speak('lucid', 'en-GB');
    await settle();
    const texts = logs.map(([, text]) => text);
    for (const file of VOICE_FILES) {
      expect(texts.some((t) => t.startsWith(`load read ${file.path} 8B `) && t.endsWith('ms'))).toBe(true);
    }
    expect(texts.filter((t) => t.startsWith('load read '))).toHaveLength(VOICE_FILES.length);
    expect(texts).toContain('load worker created');
    expect(texts).toContain('load init sent');
    workers[0]!.reply({ type: 'log', text: 'model loading' });
    expect(logs.at(-1)).toEqual(['voice', 'worker model loading']);
  });

  test('a worker error event logs its message, file and line, then fails as a crash', async () => {
    const engine = makeEngine();
    engine.speak('lucid', 'en-GB');
    await settle();
    workers[0]!.onerror!({ message: 'boom', filename: 'kokoro.worker.js', lineno: 3 });
    expect(logs).toContainEqual(['voice', 'worker error boom kokoro.worker.js:3']);
    expect(engine.status()).toBe('failed');
    expect(engine.lastError()).toBe('voice worker crashed');
  });

  test('a worker messageerror event is logged', async () => {
    const engine = makeEngine();
    engine.speak('lucid', 'en-GB');
    await settle();
    workers[0]!.onmessageerror!({});
    expect(logs.at(-1)).toEqual(['voice', 'worker messageerror']);
  });

  test('after 19 999 ms in loading the status is still loading; at 20 000 ms it fails at the last step', async () => {
    const engine = makeEngine();
    engine.speak('lucid', 'en-GB');
    await settle();
    expect(engine.status()).toBe('loading');
    workers[0]!.reply({ type: 'log', text: 'model loading' });
    vi.advanceTimersByTime(19_999);
    expect(engine.status()).toBe('loading');
    vi.advanceTimersByTime(1);
    expect(engine.status()).toBe('failed');
    expect(engine.lastError()).toBe('start timed out after 20 s at: worker model loading');
    expect(logs).toContainEqual(['voice', 'error start timed out after 20 s at: worker model loading']);
    expect(logs.at(-1)).toEqual(['voice', 'status failed']);
    expect(workers[0]!.terminated).toBe(true);
  });

  test('a late ready from the timed-out worker changes nothing', async () => {
    const engine = makeEngine();
    engine.speak('lucid', 'en-GB');
    await settle();
    vi.advanceTimersByTime(20_000);
    workers[0]!.reply({ type: 'ready' });
    expect(engine.status()).toBe('failed');
    expect(engine.lastError()).toBe('start timed out after 20 s at: load init sent');
  });

  test('after a time-out a press speaks with the system voice and starts no worker; retry starts one, and a second retry starts none', async () => {
    const engine = makeEngine();
    engine.speak('lucid', 'en-GB');
    await settle();
    vi.advanceTimersByTime(20_000);
    engine.speak('pivotal', 'en-GB');
    await settle();
    expect(spoken.at(-1)).toEqual({ text: 'pivotal', variant: 'en-GB' });
    expect(workers).toHaveLength(1);
    engine.retry();
    engine.retry();
    await settle();
    expect(workers).toHaveLength(2);
    expect(engine.status()).toBe('loading');
    expect(engine.lastError()).toBeNull();
  });

  test('retry does nothing unless the status is failed', async () => {
    const engine = makeEngine();
    engine.speak('lucid', 'en-GB');
    await settle();
    engine.retry();
    await settle();
    expect(workers).toHaveLength(1);
    expect(engine.status()).toBe('loading');
  });

  test('a worker error during the start also blocks presses until retry', async () => {
    const engine = makeEngine();
    engine.speak('lucid', 'en-GB');
    await settle();
    workers[0]!.onerror!({ message: 'boom', filename: 'kokoro.worker.js', lineno: 3 });
    engine.speak('pivotal', 'en-GB');
    await settle();
    expect(workers).toHaveLength(1);
    expect(spoken.at(-1)).toEqual({ text: 'pivotal', variant: 'en-GB' });
    engine.retry();
    await settle();
    expect(workers).toHaveLength(2);
  });

  test('a download does not count toward the start limit', async () => {
    const model = VOICE_FILES[0]!;
    const base = completeIo();
    let written = false;
    const engine = makeEngine({
      ...base,
      size: async (path) => {
        if (path === `/app/voice/${model.path}.part`) return written ? model.size : null;
        if (path === `/app/voice/${model.path}`) return null;
        return base.size(path);
      },
      rename: async () => {
        written = false;
      },
      download: async (_url, _dest, onBytes) => {
        await new Promise((resolve) => setTimeout(resolve, 60_000));
        written = true;
        onBytes(model.size);
      },
    });
    engine.speak('lucid', 'en-GB');
    await settle();
    expect(engine.status()).toBe('downloading');
    vi.advanceTimersByTime(60_000);
    await settle();
    expect(engine.status()).toBe('loading');
    vi.advanceTimersByTime(19_999);
    expect(engine.status()).toBe('loading');
    vi.advanceTimersByTime(1);
    expect(engine.status()).toBe('failed');
    expect(engine.lastError()).toMatch(/^start timed out after 20 s at: /);
  });

  test('ready in time clears the limit', async () => {
    const engine = makeEngine();
    engine.speak('lucid', 'en-GB');
    await settle();
    vi.advanceTimersByTime(19_000);
    workers[0]!.reply({ type: 'ready' });
    vi.advanceTimersByTime(5_000);
    expect(engine.status()).toBe('ready');
    expect(engine.lastError()).toBeNull();
  });

  test('after a failed download a press starts a new load, as before', async () => {
    let downloads = 0;
    const base = completeIo();
    const engine = makeEngine({
      ...base,
      size: async (path) => (path === `/app/voice/${VOICE_FILES[0]!.path}` ? null : base.size(path)),
      download: async () => {
        downloads += 1;
        throw new Error('HTTP 500');
      },
    });
    engine.speak('lucid', 'en-GB');
    await settle();
    expect(engine.status()).toBe('failed');
    engine.speak('lucid', 'en-GB');
    await settle();
    expect(downloads).toBe(2);
  });
});
