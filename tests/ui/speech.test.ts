import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { speak } from '@/ui/words/speech';

// speech.ts reads window.speechSynthesis and SpeechSynthesisUtterance; the node test environment has neither.
type Voice = { lang: string; name: string };
let spoken: { text: string; lang: string; voice: Voice | null }[] = [];
let cancelled = 0;
let voices: Voice[] = [];

beforeEach(() => {
  spoken = [];
  cancelled = 0;
  class Utterance {
    text: string;
    lang = '';
    voice: Voice | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = Utterance;
  (globalThis as unknown as { window: unknown }).window = {
    speechSynthesis: {
      cancel: () => {
        cancelled += 1;
      },
      getVoices: () => voices,
      speak: (u: { text: string; lang: string; voice: Voice | null }) => spoken.push(u),
    },
  };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  delete (globalThis as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
});

describe('speak', () => {
  test('a voice tagged en_GB (underscore, any case) matches the en-GB variant', () => {
    voices = [{ lang: 'en-US', name: 'US' }, { lang: 'en_GB', name: 'UK' }];
    speak('lucid', 'en-GB');
    expect(spoken[0]?.voice?.name).toBe('UK');
  });

  test('the tag match ignores case', () => {
    voices = [{ lang: 'EN-us', name: 'US' }];
    speak('lucid', 'en-US');
    expect(spoken[0]?.voice?.name).toBe('US');
  });

  test('a variant with no matching voice speaks with the default voice', () => {
    voices = [{ lang: 'en-US', name: 'US' }];
    speak('lucid', 'en-GB');
    expect(spoken[0]?.voice).toBeNull();
    expect(spoken[0]?.text).toBe('lucid');
  });

  test('a new call cancels the speech still running', () => {
    speak('lucid', 'en-GB');
    expect(cancelled).toBe(1);
  });
});
