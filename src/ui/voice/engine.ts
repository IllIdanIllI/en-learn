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
  /** The message of the last failure; null after a new load starts. */
  lastError(): string | null;
  subscribe(fn: () => void): () => void;
  /** Plays the text with Kokoro; a press before the voice is ready is held and played once it is. Never throws. */
  speak(text: string, variant: SpellingVariant): void;
  /** The message of the latest press whose synthesis failed; null again at the next press. */
  sentenceError(): string | null;
  /** Synthesises the text into the cache in the background; does nothing before the model is ready. */
  prefetch(text: string, variant: SpellingVariant): void;
  /** Stops the sound, drops a held press, and ignores a reply still on its way. */
  stop(): void;
  /** After a failed start, or a failed download, starts the voice again; does nothing while a load runs or when not failed. */
  retry(): void;
}

export interface KokoroDeps {
  io: VoiceIo;
  /** The folder holding the voice files (`<appData>/voice`). */
  dir: string;
  makeWorker: () => Worker;
  /** Plays the clip; `onEnd` runs when it ends, stopped or not. */
  play: (pcm: Float32Array, rate: number, onEnd: () => void) => { stop(): void };
  /** Called synchronously on every press, so WebKit lets the later playback start. */
  unlock?: () => void;
  /** The debug log; it never changes what the engine does. */
  log?: (kind: string, text: string) => void;
  /** How long the start may take once the files are on disk; the default, 20 s, is what the app uses. */
  startLimitMs?: number;
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
  | { type: 'error'; id?: number; message: string }
  | { type: 'log'; text: string };

const CACHE_LIMIT = 200;
const START_LIMIT_MS = 20_000;

/** Kokoro voice: the model is loaded on the first press, synthesis runs in `makeWorker()`, and a press before it is ready is held. */
export function createKokoroEngine(deps: KokoroDeps): VoiceEngine {
  let status: VoiceStatus = 'idle';
  let fraction = 0;
  let error: string | null = null;
  // Set from the first line of load() until it is ready or has failed: a press during the file checks starts no second load.
  let loading = false;
  // The latest press made before the voice was ready; it plays at `ready` and is dropped by stop() and by a failure.
  let held: { text: string; variant: SpellingVariant; token: number; hadClip: boolean } | null = null;
  // The message of the latest press whose synthesis failed.
  let sentence: string | null = null;
  // Bumped by each failure, so a load still awaiting its file reads gives up once it has failed.
  let generation = 0;
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  // The text of the last `load …` or `worker …` line of this start, for the time-out reason.
  let lastStep = '';
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());
  const setStatus = (next: VoiceStatus) => {
    if (next === status) return;
    log(`status ${next}`);
    status = next;
    notify();
  };

  // The debug log. A failing log never reaches the caller.
  const log = (text: string) => {
    if (/^(load|worker) /.test(text)) lastStep = text;
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

  function clearStartTimer() {
    if (startTimer !== null) clearTimeout(startTimer);
    startTimer = null;
  }

  function fail(cause: Error) {
    logError(cause.message);
    clearStartTimer();
    generation += 1;
    held = null;
    worker?.terminate();
    worker = null;
    for (const { key, entry } of waiting.values()) {
      if (cache.get(key) === entry) cache.delete(key);
      entry.reject(cause);
    }
    waiting.clear();
    loading = false;
    error = cause.message;
    setStatus('failed');
  }

  /** Starts a clip and logs it; `clip` says whether a clip was playing when the press came. */
  function playClip(text: string, clip: Clip, hadClip: boolean): { stop(): void } {
    const id = ++clipSeq;
    let shape: string;
    try {
      shape = outline(clip.pcm);
    } catch {
      shape = '?';
    }
    log(
      `play "${text}" ${clip.pcm.length} samples ${clip.rate}Hz ${(clip.pcm.length / clip.rate).toFixed(2)}s ${shape} clip=${hadClip ? 'yes' : 'no'}`,
    );
    let ended = false;
    let handle: { stop(): void };
    try {
      handle = deps.play(clip.pcm, clip.rate, () => {
        ended = true;
        log(`end "${text}"`);
        if (clipPlaying === id) clipPlaying = null;
      });
    } catch (e) {
      clipPlaying = null;
      throw e;
    }
    // Marked only once the clip really started; a clip that already ended leaves no mark.
    if (!ended) clipPlaying = id;
    return handle;
  }

  function onMessage(w: Worker, data: WorkerOut) {
    if (worker !== w) return;
    if (data.type === 'log') {
      log(`worker ${data.text}`);
    } else if (data.type === 'ready') {
      clearStartTimer();
      loading = false;
      setStatus('ready');
      const pending = held;
      held = null;
      if (pending) {
        try {
          playPress(pending.text, pending.variant, pending.token, pending.hadClip);
        } catch (e) {
          logError(e instanceof Error ? e.message : String(e));
        }
      }
    } else if (data.type === 'audio') {
      const request = waiting.get(data.id);
      if (!request) return;
      waiting.delete(data.id);
      request.entry.clip = { pcm: data.pcm, rate: data.rate };
      request.entry.resolve(request.entry.clip);
    } else if (data.id !== undefined) {
      logError(data.message);
      // One sentence failed: only its entry is dropped, so its press is silent and the worker stays.
      const request = waiting.get(data.id);
      if (!request) return;
      waiting.delete(data.id);
      if (cache.get(request.key) === request.entry) cache.delete(request.key);
      request.entry.reject(new Error(data.message));
    } else {
      fail(new Error(data.message));
    }
  }

  async function load() {
    loading = true;
    fraction = 0;
    error = null;
    lastPercent = 0;
    lastStep = '';
    const gen = generation;
    try {
      await ensureVoiceFiles(
        deps.io,
        deps.dir,
        (f) => {
          fraction = f;
          const percent = Math.floor(f * 10) * 10;
          if (percent > lastPercent) {
            lastPercent = percent;
            log(`status downloading ${percent}%`);
          }
          notify();
        },
        () => setStatus('downloading'),
      );
      setStatus('loading');
      startTimer = setTimeout(() => {
        startTimer = null;
        fail(new Error(`start timed out after 20 s at: ${lastStep || 'no step logged'}`));
      }, deps.startLimitMs ?? START_LIMIT_MS);
      const files: Record<string, ArrayBuffer> = {};
      for (const file of VOICE_FILES) {
        const started = Date.now();
        files[file.path] = await deps.io.read(`${deps.dir}/${file.path}`);
        log(`load read ${file.path} ${files[file.path]!.byteLength}B ${Date.now() - started}ms`);
      }
      // The start time-out may have failed this run while the files were read.
      if (gen !== generation) return;
      const w = deps.makeWorker();
      worker = w;
      log('load worker created');
      w.onmessage = (e: MessageEvent<WorkerOut>) => onMessage(w, e.data);
      w.onerror = (e: ErrorEvent) => {
        if (worker !== w) return;
        log(`worker error ${e.message} ${e.filename}:${e.lineno}`);
        fail(new Error('voice worker crashed'));
      };
      w.onmessageerror = () => {
        if (worker === w) log('worker messageerror');
      };
      w.postMessage({ type: 'init', files }, Object.values(files));
      log('load init sent');
    } catch (e) {
      if (gen === generation) fail(e instanceof Error ? e : new Error(String(e)));
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

  /** Plays the text on a ready voice: from the cache, or after the worker's reply, if no later press or stop() came. */
  function playPress(text: string, variant: SpellingVariant, token: number, hadClip: boolean) {
    const entry = request(text, variant, false);
    if (entry.clip) {
      log(`press "${text}" ${variant} kokoro-cached`);
      playing = playClip(text, entry.clip, hadClip);
      return;
    }
    log(`press "${text}" ${variant} kokoro-wait`);
    entry.promise.then(
      (clip) => {
        if (press !== token) return;
        playing = playClip(text, clip, hadClip);
      },
      (e: Error) => {
        if (press !== token) return;
        log(`press "${text}" ${variant} failed`);
        // A worker failure rejects its waiting presses too; the failure toast covers that, not the text one.
        if (status !== 'ready') return;
        sentence = e.message;
        notify();
      },
    );
  }

  return {
    status: () => status,
    progress: () => fraction,
    lastError: () => error,
    sentenceError: () => sentence,
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
      // Whether a previous clip was still playing at this press.
      const hadClip = clipPlaying !== null;
      stopPlayback();
      held = null;
      if (sentence !== null) {
        sentence = null;
        notify();
      }
      if (status !== 'ready') {
        if (status === 'failed' && !loading) {
          log(`press "${text}" ${variant} silent-failed`);
          notify();
          return;
        }
        log(`press "${text}" ${variant} held`);
        held = { text, variant, token, hadClip };
        if (status === 'idle' && !loading) void load();
        return;
      }
      playPress(text, variant, token, hadClip);
    },
    prefetch(text, variant) {
      if (status !== 'ready') return;
      request(text, variant, true);
    },
    stop() {
      log('stop');
      press = ++seq;
      stopPlayback();
      held = null;
    },
    retry() {
      if (status !== 'failed' || loading) return;
      void load();
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
