import { logDebug } from '@/ui/debug/debugLog';

export type SpellingVariant = 'en-GB' | 'en-US';

/** Whether this browser can speak; the speaker buttons are not shown when it cannot. */
export function canSpeak(): boolean {
  return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Stops the system speech still running. */
export function cancelSpeech(): void {
  window.speechSynthesis.cancel();
}

/** Speaks the text with a system voice of the spelling variant; a new call cancels the speech still running. */
export function speak(text: string, variant: SpellingVariant): void {
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = variant;
  // Tags are compared normalised: `en_GB` (macOS) matches `en-GB`, and the case does not matter.
  const tag = (lang: string) => lang.replace('_', '-').toLowerCase();
  const voice = synth.getVoices().find((v) => tag(v.lang).startsWith(tag(variant)));
  if (voice) utterance.voice = voice;
  logDebug('voice', voice ? `system "${text}" ${variant} voice=${voice.name} (${voice.lang})` : `system "${text}" ${variant} voice=default`);
  synth.speak(utterance);
}
