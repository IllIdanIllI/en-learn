import type { SpellingVariant } from '@/ui/words/speech';
import { ensureVoiceFiles } from './download';
import { VOICE_BY_VARIANT, VOICE_FILES } from './files';
import type { VoiceIo } from './io';
import { outline } from './outline';

export type VoiceStatus = 'idle' | 'downloading' | 'loading' | 'ready' | 'failed';

export interface VoiceEngine {
  status(): VoiceStatus;
  /** Download progress, 0..1; meaningful while `downloading`. */
  progress(): number;
  subscribe(fn: () => void): () => void;
  /** Plays the text with Kokoro once it is ready; until then, and on failure, with the system voice. Never throws. */
  speak(text: string, variant: SpellingVariant): void;
  /** Synthesises the text into the cache in the background; does nothing before the model is ready. */
  prefetch(text: string, variant: SpellingVariant): void;
  /** Stops the sound and the system voice, and ignores a reply still on its way. */
  stop(): void;
}

export interface KokoroDeps {
  io: VoiceIo;
  /** The folder holding the voice files (`<appData>/voice`). */
  dir: string;
  makeWorker: () => Worker;
  system: { canSpeak(): boolean; speak(text: string, variant: SpellingVariant): void; cancel(): void; speaking(): boolean };
  /** Plays the clip; `onEnd` runs when it ends, stopped or not. */
  play: (pcm: Float32Array, rate: number, onEnd: () => void) => { stop(): void };
  /** Called synchronously on every press, so WebKit lets the later playback start. */
  unlock?: () => void;
  /** The debug log; it never changes what the engine does. */
  log?: (kind: string, text: string) => void;
}

interface Clip {
  pcm: Float32Array;
  rate: number;
}

/** One synthesis. `clip` is set as soon as it arrives, so a cached clip plays without waiting. */
interface Entry {
  promise: Promise<Clip>;
  clip?: Clip;
  resolve: (clip: Clip) => void;
  reject: (e: Error) => void;
}

type WorkerOut =
  | { type: 'ready' }
  | { type: 'audio'; id: number; pcm: Float32Array; rate: number }
  | { type: 'error'; id?: number; message: string };

const CACHE_LIMIT = 200;

/** Kokoro voice: the model is loaded on the first press, synthesis runs in `makeWorker()`, and the system voice covers every gap. */
export function createKokoroEngine(deps: KokoroDeps): VoiceEngine {
  let status: VoiceStatus = 'idle';
  let fraction = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());
  const setStatus = (next: VoiceStatus) => {
    if (next !== status) log(`status ${next}`);
    status = next;
    notify();
  };

  // The debug log. A failing log never reaches the caller.
  const log = (text: string) => {
    try {
      deps.log?.('voice', text);
    } catch {
      // Logging is best effort.
    }
  };
  const logError = (message: string) => log(`error ${message.slice(0, 200)}`);
  // The last whole 10% of the download logged in this load; 0% is never logged.
  let lastPercent = 0;
  // The clip that is playing, by id: a stopped clip's late end must not clear the mark of the clip that replaced it.
  let clipSeq = 0;
  let clipPlaying: number | null = null;

  let worker: Worker | null = null;
  // Requests sent to the worker and not answered yet, by request id.
  const waiting = new Map<number, { key: string; entry: Entry }>();
  const cache = new Map<string, Entry>();
  // Ids for requests and presses. Only the latest press may play its reply.
  let seq = 0;
  let press = 0;
  let playing: { stop(): void } | null = null;

  function stopPlayback() {
    playing?.stop();
    playing = null;
  }

  function fail(error: Error) {
    worker?.terminate();
    worker = null;
    for (const { key, entry } of waiting.values()) {
      if (cache.get(key) === entry) cache.delete(key);
      entry.reject(error);
    }
    waiting.clear();
    setStatus('failed');
  }

  // The system voice, guarded: it does nothing where the browser cannot speak.
  const system = {
    speak: (text: string, variant: SpellingVariant) => {
      if (deps.system.canSpeak()) deps.system.speak(text, variant);
    },
    cancel: () => {
      if (deps.system.canSpeak()) deps.system.cancel();
    },
    speaking: () => deps.system.canSpeak() && deps.system.speaking() === true,
  };

  /** Starts a clip and logs it; `system` is whether the system voice was speaking when the press came. */
  function playClip(text: string, clip: Clip, systemSpeaking: boolean): { stop(): void } {
    const id = ++clipSeq;
    const clipWasPlaying = clipPlaying !== null;
    clipPlaying = id;
    log(
      `play "${text}" ${clip.pcm.length} samples ${clip.rate}Hz ${(clip.pcm.length / clip.rate).toFixed(2)}s ${outline(clip.pcm)} system=${systemSpeaking ? 'yes' : 'no'} clip=${clipWasPlaying ? 'yes' : 'no'}`,
    );
    return deps.play(clip.pcm, clip.rate, () => {
      log(`end "${text}"`);
      if (clipPlaying === id) clipPlaying = null;
    });
  }

  function onMessage(w: Worker, data: WorkerOut) {
    if (worker !== w) return;
    if (data.type === 'ready') {
      setStatus('ready');
    } else if (data.type === 'audio') {
      const request = waiting.get(data.id);
      if (!request) return;
      waiting.delete(data.id);
      request.entry.clip = { pcm: data.pcm, rate: data.rate };
      request.entry.resolve(request.entry.clip);
    } else if (data.id !== undefined) {
      logError(data.message);
      // One sentence failed: only its entry is dropped, so its press falls back to the system voice and the worker stays.
      const request = waiting.get(data.id);
      if (!request) return;
      waiting.delete(data.id);
      if (cache.get(request.key) === request.entry) cache.delete(request.key);
      request.entry.reject(new Error(data.message));
    } else {
      logError(data.message);
      fail(new Error(data.message));
    }
  }

  async function load() {
    lastPercent = 0;
    setStatus('downloading');
    try {
      await ensureVoiceFiles(deps.io, deps.dir, (f) => {
        fraction = f;
        const percent = Math.floor(f * 10) * 10;
        if (percent > lastPercent) {
          lastPercent = percent;
          log(`status downloading ${percent}%`);
        }
        notify();
      });
      setStatus('loading');
      const files: Record<string, ArrayBuffer> = {};
      for (const file of VOICE_FILES) files[file.path] = await deps.io.read(`${deps.dir}/${file.path}`);
      const w = deps.makeWorker();
      worker = w;
      w.onmessage = (e: MessageEvent<WorkerOut>) => onMessage(w, e.data);
      w.onerror = () => {
        if (worker !== w) return;
        logError('voice worker crashed');
        fail(new Error('voice worker crashed'));
      };
      w.postMessage({ type: 'init', files }, Object.values(files));
    } catch (e) {
      fail(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /** The clip for this text: from the cache, or posted to the worker. */
  function request(text: string, variant: SpellingVariant, prefetch: boolean): Entry {
    const voice = VOICE_BY_VARIANT[variant];
    const key = `${voice}|${text}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const id = ++seq;
    let resolve!: (clip: Clip) => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<Clip>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    promise.catch(() => undefined); // a failed prefetch is not an unhandled rejection
    const entry: Entry = { promise, resolve, reject };
    cache.set(key, entry);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    waiting.set(id, { key, entry });
    worker!.postMessage({ type: 'speak', id, text, voice, prefetch });
    return entry;
  }

  return {
    status: () => status,
    progress: () => fraction,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    speak(text, variant) {
      deps.unlock?.();
      const token = ++seq;
      press = token;
      stopPlayback();
      if (status !== 'ready') {
        log(`press "${text}" ${variant} system-not-ready`);
        system.speak(text, variant);
        if (status === 'idle' || status === 'failed') void load();
        return;
      }
      const systemSpeaking = system.speaking();
      system.cancel();
      const entry = request(text, variant, false);
      if (entry.clip) {
        log(`press "${text}" ${variant} kokoro-cached`);
        playing = playClip(text, entry.clip, systemSpeaking);
        return;
      }
      log(`press "${text}" ${variant} kokoro-wait`);
      entry.promise.then(
        (clip) => {
          if (press !== token) return;
          playing = playClip(text, clip, systemSpeaking);
        },
        () => {
          if (press !== token) return;
          log(`press "${text}" ${variant} system-fallback`);
          system.speak(text, variant);
        },
      );
    },
    prefetch(text, variant) {
      if (status !== 'ready') return;
      request(text, variant, true);
    },
    stop() {
      log('stop');
      press = ++seq;
      stopPlayback();
      system.cancel();
    },
  };
}

let audio: AudioContext | null = null;

/** The one shared AudioContext, created or resumed on demand. */
function sharedContext(): AudioContext {
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume();
  return audio;
}

/** Creates or resumes the shared context; called on each press from a user gesture. */
export function unlockAudio(): void {
  sharedContext();
}

/** Plays mono PCM through the shared context. */
export function playPcm(pcm: Float32Array, rate: number, onEnd: () => void): { stop(): void } {
  const ctx = sharedContext();
  const buffer = ctx.createBuffer(1, pcm.length, rate);
  buffer.getChannelData(0).set(pcm);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = onEnd;
  source.start();
  return {
    stop() {
      try {
        source.stop();
      } catch {
        // Already ended.
      }
    },
  };
}
