import { describe, expect, test } from 'vitest';
import { wroteMisspelling } from '@/core/grading/misspelling';

describe('wroteMisspelling', () => {
  test('accepts real misspellings: a swap, a missing and a doubled letter', () => {
    expect(wroteMisspelling('receive', 'I recieve letters.')).toBe(true);
    expect(wroteMisspelling('umbrella', 'an umbrela')).toBe(true);
    expect(wroteMisspelling('necessary', 'it is neccessary')).toBe(true);
    expect(wroteMisspelling('the', 'teh cat')).toBe(true);
  });

  test('rejects a different word, a correct spelling and a grammar change of a short word', () => {
    expect(wroteMisspelling('would', 'if')).toBe(false);
    expect(wroteMisspelling('necessary', 'necessary')).toBe(false);
    expect(wroteMisspelling('goes', 'he go home')).toBe(false);
    expect(wroteMisspelling('anything', '')).toBe(false);
  });

  test('ignores case and punctuation', () => {
    expect(wroteMisspelling('Wednesday', 'on wensday, we met')).toBe(true);
  });
});
