import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { t } from '@/core/i18n';
import { useCore } from '@/ui/app/CoreProvider';
import { Button } from '@/ui/components/ui/button';
import { canSpeak, type SpellingVariant } from '@/ui/words/speech';
import { chooseSystemVoice } from '@/ui/words/systemVoice';
import type { VoiceEngine } from './engine';
import { useVoice } from './VoiceProvider';

const noop = () => {};

function statusText(lang: 'ru' | 'en', voice: VoiceEngine): string {
  switch (voice.status()) {
    case 'idle':
      return t(lang, 'settings.voice.idle');
    case 'downloading':
      return t(lang, 'settings.voice.downloading', { n: Math.floor(voice.progress() * 100) });
    case 'loading':
      return t(lang, 'settings.voice.loading');
    case 'ready':
      return t(lang, 'settings.voice.ready');
    case 'failed':
      // After Retry, before the new load reports a step, the failure is cleared: the voice is starting, not failed.
      if (voice.lastError() === null) return t(lang, 'settings.voice.loading');
      return t(lang, 'settings.voice.failed', { reason: voice.lastError() ?? '' });
  }
}

/** The voice status (live), Retry after a failure, and the system voice of the spelling variant. */
export function VoiceStatusRow() {
  const { lang, settings } = useCore();
  const voice = useVoice();
  const variant: SpellingVariant = settings.spellingVariant === 'american' ? 'en-US' : 'en-GB';
  const subscribe = useCallback((onChange: () => void) => voice?.subscribe(onChange) ?? noop, [voice]);
  // The key changes with each status, progress or error, so the row re-renders; the values are read below.
  useSyncExternalStore(subscribe, () => (voice ? `${voice.status()}|${Math.floor(voice.progress() * 100)}|${voice.lastError() ?? ''}` : ''));

  // Browsers may fill the voice list only after the first call, so the choice is read again on `voiceschanged`.
  const [, setVoicesVersion] = useState(0);
  useEffect(() => {
    if (!canSpeak()) return;
    const synth = window.speechSynthesis;
    const onChange = () => setVoicesVersion((n) => n + 1);
    synth.addEventListener('voiceschanged', onChange);
    return () => synth.removeEventListener('voiceschanged', onChange);
  }, []);
  const systemVoice = canSpeak() ? chooseSystemVoice(window.speechSynthesis.getVoices(), variant) : null;
  const systemLine = systemVoice
    ? t(lang, 'settings.voice.system', { name: `${systemVoice.name} (${systemVoice.lang})` })
    : t(lang, 'settings.voice.systemDefault');

  return (
    <div className="space-y-2">
      {voice && <p className="pt-1.5">{statusText(lang, voice)}</p>}
      {voice?.status() === 'failed' && voice.lastError() !== null && (
        <Button variant="secondary" onClick={() => voice.retry()}>
          {t(lang, 'settings.voice.retry')}
        </Button>
      )}
      {canSpeak() && <p className="label text-muted-foreground">{systemLine}</p>}
    </div>
  );
}
