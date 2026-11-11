import { describe, expect, test } from 'vitest';
import {
  anagram,
  checkTranslation,
  checkTyped,
  choiceOptions,
  normalise,
  resultFor,
} from '@/core/words/check';
import type { Word } from '@/core/words/types';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function word(id: number, text: string): Word {
  return {
    id,
    word: text,
    definition: '',
    translation: '',
    example: '',
    synonyms: [],
    link: '',
    added: '2026-10-04',
    generation: 'ready',
  };
}

describe('normalise', () => {
  test('trims, lower-cases, collapses whitespace and straightens curly quotes', () => {
    expect(normalise('  Don’t   STOP“  ')).toBe('don\'t stop"');
  });
});

describe('checkTyped', () => {
  test('case and spaces ignored', () => {
    expect(checkTyped('  COHERENCE ', ['coherence'])).toBe('correct');
    expect(checkTyped('co  herence', ['co herence'])).toBe('correct');
  });

  test('coherance → almost', () => {
    expect(checkTyped('coherance', ['coherence'])).toBe('almost');
  });

  test('two letters off → wrong', () => {
    expect(checkTyped('cohxrxnce', ['coherence'])).toBe('wrong');
  });

  test('one wrong letter → almost, and the exact word → correct', () => {
    expect(checkTyped('recxive', ['receive'])).toBe('almost');
    expect(checkTyped('receive', ['receive'])).toBe('correct');
  });

  test('one swap of neighbouring letters → almost', () => {
    expect(checkTyped('recieve', ['receive'])).toBe('almost');
    expect(checkTyped('erceive', ['receive'])).toBe('almost');
    expect(checkTyped('receiev', ['receive'])).toBe('almost');
  });

  test('two swaps → wrong', () => {
    expect(checkTyped('rceieve', ['receive'])).toBe('wrong');
  });

  test('empty answer → wrong (never almost)', () => {
    expect(checkTyped('', ['a'])).toBe('wrong');
    expect(checkTyped('   ', ['a'])).toBe('wrong');
  });

  test('matches any accepted answer', () => {
    expect(checkTyped('colour', ['color', 'colour'])).toBe('correct');
  });
});

describe('checkTranslation', () => {
  test('translation ignores final period', () => {
    expect(checkTranslation('связность.', ['связность'])).toBe(true);
    expect(checkTranslation('связность!', ['связность'])).toBe(true);
    expect(checkTranslation('Связность?', ['связность'])).toBe(true);
    expect(checkTranslation('связность', ['связность.'])).toBe(true);
  });

  test('a different word is still wrong', () => {
    expect(checkTranslation('связь', ['связность'])).toBe(false);
  });

  test('empty answer is never a match', () => {
    expect(checkTranslation('', [''])).toBe(false);
  });
});

describe('resultFor', () => {
  test('hinted → hard', () => {
    expect(resultFor({ correct: true, hinted: true, retried: false })).toBe('hard');
  });

  test('retried → hard', () => {
    expect(resultFor({ correct: true, hinted: false, retried: true })).toBe('hard');
  });

  test('plain → correct', () => {
    expect(resultFor({ correct: true, hinted: false, retried: false })).toBe('correct');
  });

  test('wrong → wrong', () => {
    expect(resultFor({ correct: false, hinted: false, retried: false })).toBe('wrong');
    expect(resultFor({ correct: false, hinted: true, retried: true })).toBe('wrong');
  });
});

describe('anagram', () => {
  test("anagram of 'coherence' is a permutation and not the word, for 50 seeds", () => {
    const sorted = [...'coherence'].sort().join('');
    for (let seed = 1; seed <= 50; seed++) {
      const result = anagram('coherence', mulberry32(seed));
      expect([...result].sort().join('')).toBe(sorted);
      expect(result).not.toBe('coherence');
    }
  });

  test('spaces are removed before shuffling', () => {
    const result = anagram('ice cream', mulberry32(7));
    expect(result).not.toContain(' ');
    expect([...result].sort().join('')).toBe([...'icecream'].sort().join(''));
  });

  test('all-same letters cannot differ and still return', () => {
    expect(anagram('aaa', mulberry32(3))).toBe('aaa');
  });

  test('falls back to a rotation when shuffling keeps the original order', () => {
    expect(anagram('abc', () => 0.999999)).toBe('bca');
  });
});

describe('choiceOptions', () => {
  test('choiceOptions has 4 distinct options including the word', () => {
    const others = [word(2, 'unity'), word(3, 'lucid'), word(4, 'fluent'), word(5, 'vague')];
    const options = choiceOptions(word(1, 'coherence'), others, mulberry32(11));
    expect(options).toHaveLength(4);
    expect(new Set(options.map((o) => o.toLowerCase())).size).toBe(4);
    expect(options).toContain('coherence');
  });

  test('fewer than 4 when fewer other words exist', () => {
    const options = choiceOptions(word(1, 'coherence'), [word(2, 'unity'), word(3, 'lucid')], mulberry32(5));
    expect(options).toHaveLength(3);
    expect(options).toContain('coherence');
  });

  test('other words equal to the word or to each other (case-insensitive) count once', () => {
    const others = [word(2, 'Coherence'), word(3, 'Unity'), word(4, 'unity'), word(5, 'lucid')];
    const options = choiceOptions(word(1, 'coherence'), others, mulberry32(9));
    expect(options).toHaveLength(3);
    expect(options.filter((o) => o.toLowerCase() === 'coherence')).toHaveLength(1);
    expect(options.filter((o) => o.toLowerCase() === 'unity')).toHaveLength(1);
  });
});
