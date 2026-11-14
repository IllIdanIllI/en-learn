import { beforeEach, describe, expect, test } from 'vitest';
import { createKokoroEngine, type VoiceEngine } from '@/ui/voice/engine';
import { VOICE_FILES } from '@/ui/voice/files';
import type { VoiceIo } from '@/ui/voice/io';

type Msg = { type: string; id?: number; text?: string; voice?: string; files?: Record<string, ArrayBuffer> };

/** A worker that records what it is sent; the test drives its replies through `reply`. */
class FakeWorker {
  posted: Msg[] = [];
  terminated = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
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
let stops: number;
let unlocks: number;
let sizeCalls: number;

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
      canSpeak: () => true,
      speak: (text, variant) => spoken.push({ text, variant }),
      cancel: () => {
        cancels += 1;
      },
    },
    play: (samples, rate) => {
      plays.push({ first: samples[0]!, rate });
      return {
        stop: () => {
          stops += 1;
        },
      };
    },
    unlock: () => {
      unlocks += 1;
    },
  });
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
  stops = 0;
  unlocks = 0;
  sizeCalls = 0;
});

describe('KokoroEngine', () => {
  test('the first press falls back to the system voice and the engine is ready after the init reply', async () => {
    const engine = makeEngine();
    expect(engine.status()).toBe('idle');
    engine.speak('lucid', 'en-GB');
    expect(spoken).toEqual([{ text: 'lucid', variant: 'en-GB' }]);
    expect(engine.status()).toBe('downloading');
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

  test('an init error means failed, and the next press retries the files', async () => {
    const engine = makeEngine();
    engine.speak('lucid', 'en-GB');
    await flush();
    workers[0]!.reply({ type: 'error', message: 'no wasm' });
    expect(engine.status()).toBe('failed');
    const sizes = sizeCalls;
    engine.speak('lucid', 'en-GB');
    expect(spoken).toHaveLength(2);
    expect(engine.status()).toBe('downloading');
    await flush();
    expect(sizeCalls).toBeGreaterThan(sizes);
    expect(workers).toHaveLength(2);
  });

  test('a speak error from the worker is failed and that press keeps the system voice', async () => {
    const engine = await readyEngine();
    engine.speak('lucid', 'en-US');
    workers[0]!.reply({ type: 'error', id: workers[0]!.request().id, message: 'bad input' });
    expect(engine.status()).toBe('failed');
    await flush();
    expect(plays).toEqual([]);
    expect(spoken.at(-1)).toEqual({ text: 'lucid', variant: 'en-US' });
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
});
