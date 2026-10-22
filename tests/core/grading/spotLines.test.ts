import { describe, expect, test } from 'vitest';
import { parseSpotLines } from '@/core/grading/precheck';

describe('parseSpotLines', () => {
  test('accepts arrow variants', () => {
    expect(parseSpotLines('a -> b\nc → d\n\n e=>f ')).toEqual([
      { wrong: 'a', right: 'b' },
      { wrong: 'c', right: 'd' },
      { wrong: 'e', right: 'f' },
    ]);
  });

  test('accepts long arrows and a line without an arrow', () => {
    expect(parseSpotLines('x —> y\nu --> v\nnothing here')).toEqual([
      { wrong: 'x', right: 'y' },
      { wrong: 'u', right: 'v' },
      { wrong: 'nothing here', right: '' },
    ]);
  });
});
