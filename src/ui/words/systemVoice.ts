import type { SpellingVariant } from '@/ui/words/speech';

/** What the choice reads from a system voice. */
export interface VoiceLike {
  name: string;
  lang: string;
  default?: boolean;
}

/** macOS Eloquence and novelty voices, by base name (the text before " ("). */
const NOVELTY = new Set([
  'Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley', 'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles',
  'Cellos', 'Fred', 'Good News', 'Jester', 'Junior', 'Kathy', 'Organ', 'Ralph', 'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox',
]);

/** Preferred voices by base name, best first. */
const PREFERRED: Record<SpellingVariant, readonly string[]> = {
  'en-US': ['Samantha', 'Alex', 'Ava', 'Allison', 'Susan', 'Tom', 'Nicky'],
  'en-GB': ['Daniel', 'Serena', 'Kate', 'Oliver', 'Stephanie'],
};

// `en_GB` (macOS) matches `en-GB`, and the case does not matter.
const tag = (lang: string) => lang.replace('_', '-').toLowerCase();
const baseName = (name: string) => (name.includes(' (') ? name.slice(0, name.indexOf(' (')) : name);

/**
 * The system voice to speak with: the browser's default when it matches the language, else the best of the
 * rest (no novelty voices; Premium, then Enhanced, then the preferred names, then the first). Null means
 * the caller sets no voice and the browser picks one by language.
 */
export function chooseSystemVoice<V extends VoiceLike>(voices: readonly V[], variant: SpellingVariant): V | null {
  const matching = voices.filter((v) => tag(v.lang) === tag(variant));
  const browserDefault = matching.find((v) => v.default);
  if (browserDefault) return browserDefault;

  const pool = matching.filter((v) => !NOVELTY.has(baseName(v.name)));
  const preferred = PREFERRED[variant]
    .map((name) => pool.find((v) => baseName(v.name) === name))
    .find((v) => v !== undefined);
  return (
    pool.find((v) => v.name.includes('Premium')) ??
    pool.find((v) => v.name.includes('Enhanced')) ??
    preferred ??
    pool[0] ??
    null
  );
}
