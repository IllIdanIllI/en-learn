import type { VoiceEngine, VoiceStatus } from './engine';

declare global {
  interface Window {
    /** Preview only: the texts the preview voice has "spoken", for tests. */
    __spoken?: string[];
  }
}

/**
 * Browser preview voice, provided only when the URL has `?voice=`: `downloading` holds the download at 40%,
 * `downloaded` starts at 100% and is ready 300 ms after the first subscribe, and any other value is a ready voice
 * that records each spoken text in `window.__spoken`. A subscriber is notified once when it subscribes.
 */
export function previewVoice(search: string): VoiceEngine | null {
  const mode = new URLSearchParams(search).get('voice');
  if (mode === null) return null;
  const downloading = mode === 'downloading';
  const downloaded = mode === 'downloaded';
  let status: VoiceStatus = downloading || downloaded ? 'downloading' : 'ready';
  let timerStarted = false;
  const listeners = new Set<() => void>();
  return {
    status: () => status,
    progress: () => (downloading ? 0.4 : 1),
    lastError: () => null,
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
