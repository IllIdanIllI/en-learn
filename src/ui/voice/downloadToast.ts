import type { VoiceStatus } from './engine';

/** What the voice notification shows after a change: download progress, the start, ready or a failure, or nothing. */
export type ToastAction =
  | { kind: 'progress'; percent: number }
  | { kind: 'starting' }
  | { kind: 'success' }
  | { kind: 'failure'; message: string }
  | null;

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
  // The start has no measurable progress, so it shows once, also when nothing was downloaded.
  if (next === 'loading' && prev !== 'loading') return { kind: 'starting' };
  if (next === 'ready' && (prev === 'downloading' || prev === 'loading')) return { kind: 'success' };
  // After Retry the status stays failed with no error for a moment: that is a start, not a failure. A press while
  // failed (failed to failed) has the error and shows the failure again.
  if (next === 'failed' && error !== null) return { kind: 'failure', message: error };
  return null;
}
