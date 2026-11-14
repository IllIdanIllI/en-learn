import type { VoiceStatus } from './engine';

/** What the download notification shows after a change: a progress line, a success or a failure, or nothing. */
export type ToastAction = { kind: 'progress'; percent: number } | { kind: 'success' } | { kind: 'failure'; message: string } | null;

/**
 * Decides the notification for one engine change. `lastPercent` is the whole percent last shown (null when none),
 * so a download shows each percent once.
 */
export function downloadToast(
  prev: VoiceStatus,
  next: VoiceStatus,
  fraction: number,
  lastPercent: number | null,
  error: string | null,
): ToastAction {
  if (next === 'downloading') {
    const percent = Math.floor(fraction * 100);
    return percent !== lastPercent ? { kind: 'progress', percent } : null;
  }
  if (prev === 'downloading' && (next === 'loading' || next === 'ready')) return { kind: 'success' };
  if (prev === 'downloading' && next === 'failed') return { kind: 'failure', message: error ?? '' };
  return null;
}
