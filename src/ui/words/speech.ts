export type SpellingVariant = 'en-GB' | 'en-US';

/** Whether this browser can speak; the speaker buttons are not shown when it cannot. */
export function canSpeak(): boolean {
  return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Speaks the text with a system voice of the spelling variant; a new call cancels the speech still running. */
export function speak(text: string, variant: SpellingVariant): void {
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = variant;
  const voice = synth.getVoices().find((v) => v.lang.startsWith(variant));
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
}
