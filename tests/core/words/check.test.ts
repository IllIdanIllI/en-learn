import { describe, expect, test } from 'vitest';
import {
  anagram,
  buildResult,
  checkTranslation,
  checkTyped,
  choiceOptions,
  clueOf,
  normalise,
  resultFor,
  revealsWord,
  spellingsOf,
  withSpaces,
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

  test('a phrase keeps its single space, each word is a permutation of its letters, and the result differs', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const result = anagram('give up', mulberry32(seed));
      expect(result.indexOf(' ')).toBe(4);
      expect(result.split(' ')).toHaveLength(2);
      const [first, second] = result.split(' ') as [string, string];
      expect([...first].sort().join('')).toBe('egiv');
      expect([...second].sort().join('')).toBe('pu');
      expect(result).not.toBe('give up');
    }
  });

  test('a phrase whose words all repeat one letter is returned as it is', () => {
    expect(anagram('aa bb', mulberry32(4))).toBe('aa bb');
    expect(anagram('a b', mulberry32(4))).toBe('a b');
  });

  test('the fallback rotates the first word that can differ, never across words', () => {
    expect(anagram('ab cd', () => 0.999999)).toBe('ba cd');
    expect(anagram('aa bcd', () => 0.999999)).toBe('aa cdb');
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

describe('withSpaces', () => {
  test('puts the spaces of the word back at the same positions', () => {
    expect(withSpaces('giveup', 'give up')).toBe('give up');
    expect(withSpaces('abc', 'abc')).toBe('abc');
  });

  test('a partial string gets a space only before a letter that passes a gap, never a trailing one', () => {
    expect(withSpaces('giveu', 'give up')).toBe('give u');
    expect(withSpaces('give', 'give up')).toBe('give');
    expect(withSpaces('giv', 'give up')).toBe('giv');
  });
});

describe('buildResult', () => {
  test('no mistake is correct, one or two are hard, three or more are wrong', () => {
    expect(buildResult(0)).toBe('correct');
    expect(buildResult(1)).toBe('hard');
    expect(buildResult(2)).toBe('hard');
    expect(buildResult(3)).toBe('wrong');
    expect(buildResult(4)).toBe('wrong');
  });
});

describe('revealsWord', () => {
  test('a word shown in the text, outside the gap, reveals it, whatever the case', () => {
    expect(revealsWord('Intermittent ___ showers', ['rain'], 'intermittent')).toBe(true);
    expect(revealsWord('Intermittent ___ showers kept on', ['rain'], 'intermittent')).toBe(true);
  });

  test('an answer shown in the text reveals the word', () => {
    expect(revealsWord('They ___ it; superseded rules', ['superseded'], 'supersede')).toBe(true);
  });

  test('a phrase word reveals the phrase, with any spaces between its words', () => {
    expect(revealsWord('Do not give up ___', ['x'], 'give up')).toBe(true);
    expect(revealsWord('Do not give   up ___', ['x'], 'give up')).toBe(true);
  });

  test('the word only inside a longer word does not reveal it', () => {
    expect(revealsWord('It was ___ reliable', ['rely'], 'rely')).toBe(false);
    expect(revealsWord('It is reliable ___', [], 'able')).toBe(false);
  });

  test('a gap that is the only place for the word does not reveal it', () => {
    expect(revealsWord('___ showers kept on', ['rain'], 'intermittent')).toBe(false);
    expect(revealsWord('Intermittent ___ showers', ['rain'], 'supersede')).toBe(false);
  });

  test('a word with regular-expression characters does not throw', () => {
    expect(revealsWord('The c++ language ___', ['x'], 'c++')).toBe(true);
    expect(revealsWord('The ___ language', ['x'], 'c++')).toBe(false);
  });

  test('a typographic apostrophe matches a straight one', () => {
    expect(revealsWord('Don’t ___', [], "don't")).toBe(true);
  });

  test('an empty word or no text reveals nothing; empty answers are ignored', () => {
    expect(revealsWord('', [], 'up')).toBe(false);
    expect(revealsWord('x ___', [''], '')).toBe(false);
    expect(revealsWord('x ___', [''], 'up')).toBe(false);
  });
});

describe('clueOf', () => {
  const both = { ...word(1, 'coherence'), translation: '  связность ', definition: 'the quality of fitting together' };

  test('Russian shows the translation, English the definition', () => {
    expect(clueOf(both, 'ru')).toBe('связность');
    expect(clueOf(both, 'en')).toBe('the quality of fitting together');
  });

  test('a missing field falls back to the other one', () => {
    expect(clueOf({ ...both, translation: '  ' }, 'ru')).toBe('the quality of fitting together');
    expect(clueOf({ ...both, definition: '' }, 'en')).toBe('связность');
  });
});

describe('spellingsOf', () => {
  test('a single word is accepted once', () => {
    expect(spellingsOf('resilient')).toEqual(['resilient']);
  });

  test('a multi-word spelling is accepted as written and without spaces', () => {
    expect(spellingsOf('take off')).toEqual(['take off', 'takeoff']);
    expect(checkTyped('takeoff', spellingsOf('take off'))).toBe('correct');
    expect(checkTyped('take off', spellingsOf('take off'))).toBe('correct');
  });
});
