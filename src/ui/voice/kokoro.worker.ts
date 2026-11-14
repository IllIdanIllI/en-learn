import { env } from '@huggingface/transformers';
import { KokoroTTS } from 'kokoro-js';
// The JSEP build of onnxruntime-web, the one @huggingface/transformers bundles. Served from the app's own origin.
import wasmUrl from 'ort-dist/ort-wasm-simd-threaded.jsep.wasm?url';
import mjsUrl from 'ort-dist/ort-wasm-simd-threaded.jsep.mjs?url';
import { nextRequest } from './queue';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
// Any revision: the files come from the app's own copy, which is pinned in files.ts.
const FILE_URL = /^https:\/\/huggingface\.co\/onnx-community\/Kokoro-82M-v1\.0-ONNX\/resolve\/[^/]+\/(.+)$/;

type Speak = { type: 'speak'; id: number; text: string; voice: 'af_heart' | 'bf_emma'; prefetch: boolean };
type In = { type: 'init'; files: Record<string, ArrayBuffer> } | Speak;

let files: Record<string, ArrayBuffer> = {};
let tts: KokoroTTS | null = null;

// The model loader fetches from Hugging Face; serve those paths from the bytes the page passed in.
const realFetch = self.fetch.bind(self);
self.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const match = FILE_URL.exec(url);
  if (match) {
    const bytes = files[match[1] ?? ''];
    return bytes ? new Response(bytes, { status: 200 }) : new Response(null, { status: 404 });
  }
  // Any other origin is refused; only the app's own origin is fetched.
  if (new URL(url, self.location.href).origin !== self.location.origin) return new Response(null, { status: 404 });
  return realFetch(input, init);
};

async function handle(msg: In) {
  try {
    if (msg.type === 'init') {
      files = msg.files;
      env.useBrowserCache = false;
      env.allowLocalModels = false;
      env.backends.onnx.wasm!.numThreads = 1;
      env.backends.onnx.wasm!.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
      tts = await KokoroTTS.from_pretrained(MODEL, { dtype: 'q8', device: 'wasm' });
      self.postMessage({ type: 'ready' });
    } else {
      if (!tts) throw new Error('the voice model is not loaded');
      const audio = await tts.generate(msg.text, { voice: msg.voice });
      self.postMessage({ type: 'audio', id: msg.id, pcm: audio.audio, rate: audio.sampling_rate });
    }
  } catch (e) {
    const message = e instanceof Error ? (e.stack ?? e.message) : String(e);
    self.postMessage({ type: 'error', id: msg.type === 'speak' ? msg.id : undefined, message });
  }
}

// One synthesis at a time: a speak waits for the init, and a press runs before the queued prefetches.
let initing: Promise<void> = Promise.resolve();
const pending: Speak[] = [];
let running = false;

async function pump() {
  if (running) return;
  running = true;
  try {
    await initing;
    for (let i = nextRequest(pending); i !== -1; i = nextRequest(pending)) {
      const [msg] = pending.splice(i, 1);
      await handle(msg!);
    }
  } finally {
    running = false;
  }
}

self.addEventListener('message', (e: MessageEvent<In>) => {
  if (e.data.type === 'init') {
    initing = handle(e.data);
    return;
  }
  pending.push(e.data);
  void pump();
});
