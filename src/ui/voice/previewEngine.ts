import type { VoiceEngine, VoiceStatus } from './engine';

declare global {
  interface Window {
    /** Preview only: the texts the preview voice has "spoken", for tests. */
    __spoken?: string[];
  }
}

/**
 * Browser preview voice, provided only when the URL has `?voice=`: `downloading` holds the download at 40%,
 * `downloaded` starts at 100% and is ready 300 ms after the first subscribe, `failed` has failed to start with the
 * time-out reason and `retry()` makes it ready, and any other value is a ready voice
 * that records each spoken text in `window.__spoken`. A subscriber is notified once when it subscribes.
 */
export function previewVoice(search: string): VoiceEngine | null {
  const mode = new URLSearchParams(search).get('voice');
  if (mode === null) return null;
  const downloading = mode === 'downloading';
  const downloaded = mode === 'downloaded';
  const failed = mode === 'failed';
  let status: VoiceStatus = downloading || downloaded ? 'downloading' : failed ? 'failed' : 'ready';
  let error: string | null = failed ? 'start timed out after 20 s at: worker model loading' : null;
  let timerStarted = false;
  const listeners = new Set<() => void>();
  return {
    status: () => status,
    progress: () => (downloading ? 0.4 : 1),
    lastError: () => error,
    retry() {
      if (status !== 'failed') return;
      status = 'ready';
      error = null;
      listeners.forEach((listener) => listener());
    },
    subscribe(fn) {
      listeners.add(fn);
      fn();
      if (downloaded && !timerStarted) {
        timerStarted = true;
        setTimeout(() => {
          status = 'ready';
          listeners.forEach((listener) => listener());
        }, 300);
      }
      return () => {
        listeners.delete(fn);
      };
    },
    speak: (text) => {
      if (status === 'ready') (window.__spoken ??= []).push(text);
    },
    prefetch: () => {},
    stop: () => {},
  };
}
