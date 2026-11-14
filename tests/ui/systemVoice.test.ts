import { describe, expect, test } from 'vitest';
import { chooseSystemVoice, type VoiceLike } from '@/ui/words/systemVoice';

const voice = (name: string, lang = 'en-US', over: Partial<VoiceLike> = {}): VoiceLike => ({ name, lang, ...over });

describe('chooseSystemVoice', () => {
  test('the browser default voice wins when it matches the language', () => {
    const karen = voice('Karen', 'en-US', { default: true });
    expect(chooseSystemVoice([voice('Samantha'), karen], 'en-US')).toBe(karen);
  });

  test('a default voice of another language is ignored', () => {
    const samantha = voice('Samantha');
    expect(chooseSystemVoice([samantha, voice('Daniel', 'en-GB', { default: true })], 'en-US')).toBe(samantha);
  });

  test('novelty voices are dropped, so Flo loses to Samantha', () => {
    const samantha = voice('Samantha');
    expect(chooseSystemVoice([voice('Flo (en-US)'), samantha], 'en-US')).toBe(samantha);
  });

  test('when only novelty voices match, none is chosen', () => {
    expect(chooseSystemVoice([voice('Flo'), voice('Bells'), voice('Albert')], 'en-US')).toBeNull();
  });

  test('Premium beats Enhanced beats a preferred name', () => {
    const ava = voice('Ava (Premium)');
    expect(chooseSystemVoice([voice('Alex'), voice('Samantha (Enhanced)'), ava], 'en-US')).toBe(ava);
  });

  test('Enhanced beats a preferred name', () => {
    const samantha = voice('Samantha (Enhanced)');
    expect(chooseSystemVoice([voice('Alex'), samantha], 'en-US')).toBe(samantha);
  });

  test('en-US preferred names keep their order: Samantha before Alex', () => {
    const samantha = voice('Samantha');
    expect(chooseSystemVoice([voice('Alex'), samantha], 'en-US')).toBe(samantha);
  });

  test('en-GB picks Daniel from the preferred names', () => {
    const daniel = voice('Daniel', 'en-GB');
    expect(chooseSystemVoice([voice('Serena', 'en-GB'), daniel], 'en-GB')).toBe(daniel);
  });

  test('a tag with an underscore and another case matches the variant', () => {
    const daniel = voice('Daniel', 'en_GB');
    expect(chooseSystemVoice([daniel], 'en-GB')).toBe(daniel);
  });

  test('no voice of the variant language gives none', () => {
    expect(chooseSystemVoice([voice('Samantha', 'en-US')], 'en-GB')).toBeNull();
  });

  test('an empty list gives none', () => {
    expect(chooseSystemVoice([], 'en-US')).toBeNull();
  });

  test('with no preferred name, the first remaining voice is chosen', () => {
    const moira = voice('Moira');
    expect(chooseSystemVoice([voice('Flo (en-US)'), moira], 'en-US')).toBe(moira);
  });

  test('keeps the type of the voice it is given', () => {
    const list = [{ name: 'Tom', lang: 'en-US', voiceURI: 'tom' }];
    expect(chooseSystemVoice(list, 'en-US')?.voiceURI).toBe('tom');
  });
});
