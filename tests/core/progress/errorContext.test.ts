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
      expect(c.was).toEqual({ before: 'She is ', changed: 'an teacher', after: ' here.' });
      expect(c.shouldBe).toEqual({ before: 'She is ', changed: 'a teacher', after: ' here.' });
    }
  });

  test('fix with an error, answered with a wrong fragment: the learner fragment in place of the wrong one', () => {
    const c = ctx({ format: 'fix', prompt: 'She is an teacher here.', wrong: 'an teacher', expected: 'a teacher', text: 'the teacher' });
    expect(snippetText(c.was)).toBe('She is the teacher here.');
    expect(c.was.changed).toBe('the teacher');
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
    expect(c.was).toEqual({ before: 'Yesterday ', changed: 'he go to', after: ' school. Then he came …' });
    expect(snippetText(c.shouldBe)).toBe('Yesterday he went to school. Then he came …');
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
      expect(ctx({ format: 'spot', prompt: 'he go to', expected, paragraph, fix: 'he went to' }).shouldBe.changed).toBe('he went to');
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
});
