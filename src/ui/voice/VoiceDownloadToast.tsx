import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { t } from '@/core/i18n';
import { useCore } from '@/ui/app/CoreProvider';
import { downloadToast } from './downloadToast';
import type { VoiceStatus } from './engine';
import { useVoice } from './VoiceProvider';

/**
 * The one notification for the voice (download, start, ready, failure with Retry) and a separate one when a single
 * text could not be voiced. Renders nothing.
 */
export function VoiceDownloadToast() {
  const voice = useVoice();
  const { lang } = useCore();
  const prev = useRef<VoiceStatus>('idle');
  const lastPercent = useRef<number | null>(null);
  const lastSentenceError = useRef<string | null>(null);
  useEffect(() => {
    if (voice === null) return;
    const show = () => {
      const next = voice.status();
      const action = downloadToast(prev.current, next, voice.progress(), lastPercent.current, voice.lastError());
      prev.current = next;
      if (next !== 'downloading') lastPercent.current = null;
      // The same failed text shows once; the memory resets when the error clears, so a later press shows it again.
      const sentenceError = voice.sentenceError();
      if (sentenceError !== lastSentenceError.current && sentenceError !== null) {
        toast.error(t(lang, 'voice.speak.failed', { message: sentenceError }), { id: 'voice-speak', duration: 8000 });
      }
      lastSentenceError.current = sentenceError;
      if (action === null) return;
      if (action.kind === 'progress') {
        lastPercent.current = action.percent;
        toast.loading(t(lang, 'voice.download.progress', { n: action.percent }), { id: 'voice-download', duration: Infinity });
      } else if (action.kind === 'starting') {
        toast.loading(t(lang, 'voice.start.progress'), { id: 'voice-download', duration: Infinity });
      } else if (action.kind === 'success') {
        toast.success(t(lang, 'voice.ready'), { id: 'voice-download', duration: 4000 });
      } else {
        toast.error(t(lang, 'voice.failed', { message: action.message }), {
          id: 'voice-download',
          duration: 8000,
          action: { label: t(lang, 'settings.voice.retry'), onClick: () => voice.retry() },
        });
      }
    };
    return voice.subscribe(show);
  }, [voice, lang]);
  return null;
}
