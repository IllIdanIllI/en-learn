import { describe, expect, test } from 'vitest';
import { errorContext, snippetText, type ErrorContextInput } from '@/core/progress/errorContext';

const base: ErrorContextInput = { format: 'gap', prompt: '', expected: '', wrong: null, text: '', fix: '', paragraph: null };
const ctx = (over: Partial<ErrorContextInput>) => errorContext({ ...base, ...over });

describe('errorContext', () => {
  test('gap: the blank filled with the answer and with the right answer', () => {
    const c = ctx({ prompt: 'He ___ home.', expected: 'goes', text: 'go' });
    expect(c.was).toEqual({ before: 'He ', changed: 'go', after: ' home.' });
    expect(c.shouldBe).toEqual({ before: 'He ', changed: 'goes', after: ' home.' });
    expect(c.sentence).toBe('He ___ home.');
    expect(c.hint).toBeNull();
  });

  test('fix with an error, answered with a tick or a shorthand: the original fragment and the correction', () => {
    for (const text of ['✓', '+']) {
      const c = ctx({ format: 'fix', prompt: 'She is an teacher here.', wrong: 'an teacher', expected: 'a teacher', text });
      expect(c.was).toEqual({ before: 'She is ', changed: 'an', after: ' teacher here.' });
      expect(c.shouldBe).toEqual({ before: 'She is ', changed: 'a', after: ' teacher here.' });
    }
  });

  test('fix with an error, answered with a wrong fragment: the learner fragment in place of the wrong one', () => {
    const c = ctx({ format: 'fix', prompt: 'She is an teacher here.', wrong: 'an teacher', expected: 'a teacher', text: 'the teacher' });
    expect(snippetText(c.was)).toBe('She is the teacher here.');
    expect(c.was.changed).toBe('the');
    expect(snippetText(c.shouldBe)).toBe('She is a teacher here.');
  });

  test('fix without an error, "fixed" by the learner: the fragment alone and the original sentence', () => {
    const c = ctx({ format: 'fix', prompt: 'The sun rises in the east.', wrong: '', expected: '✓', text: 'sun rise' });
    expect(c.was).toEqual({ before: '', changed: 'sun rise', after: '' });
    expect(c.shouldBe).toEqual({ before: '', changed: 'The sun rises in the east.', after: '' });
  });

  test('fix without an error: a long sentence is cut around its middle', () => {
    const prompt = 'one two three four five six seven eight nine ten eleven twelve';
    const c = ctx({ format: 'fix', prompt, wrong: '', expected: '✓', text: 'x' });
    expect(c.shouldBe).toEqual({ before: '… ', changed: 'three four five six seven eight nine ten eleven', after: ' …' });
  });

  test('spot: the wrong text in its paragraph and the correction in its place', () => {
    const paragraph = 'Yesterday he go to school. Then he came back.';
    const c = ctx({ format: 'spot', prompt: 'he go to', expected: 'he went to', text: 'x', paragraph });
    expect(c.was).toEqual({ before: 'Yesterday he ', changed: 'go', after: ' to school. Then he …' });
    expect(c.shouldBe).toEqual({ before: 'Yesterday he ', changed: 'went', after: ' to school. Then he …' });
    expect(snippetText(c.shouldBe)).toBe('Yesterday he went to school. Then he …');
    expect(c.sentence).toBe(paragraph);
  });

  test('spot without a paragraph shows the plain texts', () => {
    const c = ctx({ format: 'spot', prompt: 'he go', expected: 'he goes' });
    expect(c.was).toEqual({ before: '', changed: 'he go', after: '' });
    expect(c.shouldBe).toEqual({ before: '', changed: 'he goes', after: '' });
  });

  test('spot with a tick as stored correction never shows the tick', () => {
    const paragraph = 'Yesterday he go to school.';
    for (const expected of ['✓', '+']) {
      expect(ctx({ format: 'spot', prompt: 'he go to', expected, paragraph, fix: 'he went to' }).shouldBe.changed).toBe('went');
      const c = ctx({ format: 'spot', prompt: 'he go to', expected, paragraph });
      expect(c.shouldBe.changed).toBe('he go to');
      expect(c.shouldBe.changed).not.toBe(expected);
    }
  });

  test('spelling: the learner spelling, the word and the hint', () => {
    const c = ctx({ format: 'spelling', prompt: 'to get', expected: 'receive', text: 'recieve' });
    expect(c.was).toEqual({ before: '', changed: 'recieve', after: '' });
    expect(c.shouldBe).toEqual({ before: '', changed: 'receive', after: '' });
    expect(c.hint).toBe('to get');
  });

  test('older fix item without a stored wrong fragment: plain answer and correction', () => {
    const c = ctx({ format: 'fix', prompt: 'She is an teacher here.', wrong: null, expected: 'a teacher', text: 'the teacher' });
    expect(c.was).toEqual({ before: '', changed: 'the teacher', after: '' });
    expect(c.shouldBe).toEqual({ before: '', changed: 'a teacher', after: '' });
  });

  test('older fix item answered with a tick: was falls back to the original sentence', () => {
    for (const text of ['✓', '+', '']) {
      const c = ctx({ format: 'fix', prompt: 'She is an teacher here.', wrong: null, expected: 'a teacher', text });
      expect(c.was).toEqual({ before: '', changed: 'She is an teacher here.', after: '' });
      expect(c.shouldBe.changed).toBe('a teacher');
    }
  });

  test('a wrong fragment that is not in the prompt cannot be placed', () => {
    const c = ctx({ format: 'fix', prompt: 'She is here.', wrong: 'an teacher', expected: 'a teacher', text: 'x' });
    expect(c.was.changed).toBe('x');
  });

  test('window: four words each side, "…" where cut', () => {
    const prompt = 'a b c d e f g ___ h i j k l m n';
    const c = ctx({ prompt, expected: 'X', text: 'Y' });
    expect(c.was).toEqual({ before: '… d e f g ', changed: 'Y', after: ' h i j k …' });
    expect(snippetText(c.shouldBe)).toBe('… d e f g X h i j k …');
  });

  test('window: exactly four words on a side is not cut', () => {
    const c = ctx({ prompt: 'a b c d ___ e f g h.', expected: 'X', text: 'Y' });
    expect(c.was).toEqual({ before: 'a b c d ', changed: 'Y', after: ' e f g h.' });
  });

  test('the LLM fix is preferred over expected when present', () => {
    const c = ctx({ prompt: 'He ___ home.', expected: 'goes', text: 'go', fix: 'is going' });
    expect(c.shouldBe.changed).toBe('is going');
    expect(ctx({ prompt: 'He ___ home.', expected: 'goes', text: 'go', fix: '✓' }).shouldBe.changed).toBe('goes');
  });

  test('a gap answered with nothing shows the sentence in Было', () => {
    const c = ctx({ prompt: 'He ___ home.', expected: 'goes', text: '' });
    expect(c.was.changed).toBe('He ___ home.');
  });

  describe('word-level change (K2)', () => {
    const fix = (prompt: string, wrong: string, expected: string) =>
      ctx({ format: 'fix', prompt, wrong, expected, text: '✓' });

    test('an extra word: Должно быть shows "__"', () => {
      const c = fix('I like the films a lot.', 'the films', 'films');
      expect(c.was).toEqual({ before: 'I like ', changed: 'the', after: ' films a lot.' });
      expect(c.shouldBe).toEqual({ before: 'I like ', changed: '__', after: ' films a lot.' });
    });

    test('a missed word: Было shows "__"', () => {
      const c = fix('He is going.', 'is going', 'is not going');
      expect(c.was).toEqual({ before: 'He is ', changed: '__', after: ' going.' });
      expect(c.shouldBe).toEqual({ before: 'He is ', changed: 'not', after: ' going.' });
    });

    test('a differing middle on both sides stays highlighted, shared ends move out', () => {
      const c = fix('He has went to school today.', 'has went to school', 'has gone to school');
      expect(c.was).toEqual({ before: 'He has ', changed: 'went', after: ' to school today.' });
      expect(c.shouldBe).toEqual({ before: 'He has ', changed: 'gone', after: ' to school today.' });
      const d = fix('Did it yesterday for them.', 'it yesterday for', 'we yesterday to');
      expect(d.was.changed).toBe('it yesterday for');
      expect(d.shouldBe.changed).toBe('we yesterday to');
    });

    test('words are compared case-insensitively, original text kept', () => {
      const c = fix('Yes. The films are old.', 'The films', 'films');
      expect(c.was).toEqual({ before: 'Yes. ', changed: 'The', after: ' films are old.' });
      const d = fix('So Films are old.', 'Films', 'films were');
      expect(d.was).toEqual({ before: 'So Films ', changed: '__', after: ' are old.' });
    });

    test('the four-word window still applies to the outer context', () => {
      const c = fix('a b c d e f the films g h i j k l', 'the films', 'films');
      expect(c.was).toEqual({ before: '… c d e f ', changed: 'the', after: ' films g h i …' });
    });

    test('a gap answered with extra shared words moves them out', () => {
      const c = ctx({ prompt: 'He ___ now.', expected: 'is going', text: 'was going' });
      expect(c.was).toEqual({ before: 'He ', changed: 'was', after: ' going now.' });
      expect(c.shouldBe).toEqual({ before: 'He ', changed: 'is', after: ' going now.' });
    });
  });
});
