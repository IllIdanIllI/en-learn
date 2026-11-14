import type { VoiceEngine, VoiceStatus } from './engine';

declare global {
  interface Window {
    /** Preview only: the texts the preview voice has "spoken", for tests. */
    __spoken?: string[];
  }
}

/**
 * Browser preview voice, provided only when the URL has `?voice=`: `downloading` holds the download at 40%,
 * any other value is a ready voice that records each spoken text in `window.__spoken`.
 */
export function previewVoice(search: string): VoiceEngine | null {
  const mode = new URLSearchParams(search).get('voice');
  if (mode === null) return null;
  const downloading = mode === 'downloading';
  const status: VoiceStatus = downloading ? 'downloading' : 'ready';
  return {
    status: () => status,
    progress: () => (downloading ? 0.4 : 1),
    subscribe: () => () => {},
    speak: (text) => {
      if (!downloading) (window.__spoken ??= []).push(text);
    },
    prefetch: () => {},
    stop: () => {},
  };
}
