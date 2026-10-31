import { describe, expect, test } from 'vitest';
import { splitTitle } from '@/ui/progress/ProgressLog';

describe('splitTitle', () => {
  test('separates the part before the first ": " as the bold head', () => {
    expect(splitTitle('Review: articles')).toEqual({ head: 'Review', tail: ': articles' });
    expect(splitTitle('Повторение: артикли')).toEqual({ head: 'Повторение', tail: ': артикли' });
  });

  test('keeps a title without ": " plain', () => {
    expect(splitTitle('Повторение')).toEqual({ head: '', tail: 'Повторение' });
    expect(splitTitle('Review:articles')).toEqual({ head: '', tail: 'Review:articles' });
  });

  test('splits at the first ": " only', () => {
    expect(splitTitle('Review: a: b')).toEqual({ head: 'Review', tail: ': a: b' });
  });
});
