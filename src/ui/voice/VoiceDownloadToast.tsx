import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { t } from '@/core/i18n';
import { useCore } from '@/ui/app/CoreProvider';
import { downloadToast } from './downloadToast';
import type { VoiceStatus } from './engine';
import { useVoice } from './VoiceProvider';

/** The one notification for the voice download: progress while it runs, then success or failure. Renders nothing. */
export function VoiceDownloadToast() {
  const voice = useVoice();
  const { lang } = useCore();
  const prev = useRef<VoiceStatus>('idle');
  const lastPercent = useRef<number | null>(null);
  useEffect(() => {
    if (voice === null) return;
    const show = () => {
      const next = voice.status();
      const action = downloadToast(prev.current, next, voice.progress(), lastPercent.current, voice.lastError());
      prev.current = next;
      if (next !== 'downloading') lastPercent.current = null;
      if (action === null) return;
      if (action.kind === 'progress') {
        lastPercent.current = action.percent;
        toast.loading(t(lang, 'voice.download.progress', { n: action.percent }), { id: 'voice-download', duration: Infinity });
      } else if (action.kind === 'success') {
        toast.success(t(lang, 'voice.download.done'), { id: 'voice-download', duration: 4000 });
      } else {
        toast.error(t(lang, 'voice.download.failed', { message: action.message }), { id: 'voice-download', duration: 8000 });
      }
    };
    return voice.subscribe(show);
  }, [voice, lang]);
  return null;
}
