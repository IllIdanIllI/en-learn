import { describe, expect, test } from 'vitest';
import { lineDiff } from '@/core/rules/lineDiff';

describe('lineDiff', () => {
  test('identical text is all same', () => {
    expect(lineDiff('a\nb', 'a\nb')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'same', text: 'b' },
    ]);
  });

  test('an added line sits between the unchanged ones', () => {
    expect(lineDiff('a\nc', 'a\nb\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'add', text: 'b' },
      { kind: 'same', text: 'c' },
    ]);
  });

  test('a changed line is a deletion followed by an addition', () => {
    expect(lineDiff('a\nold\nc', 'a\nnew\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'old' },
      { kind: 'add', text: 'new' },
      { kind: 'same', text: 'c' },
    ]);
  });

  test('removed lines at the end, and empty sides', () => {
    expect(lineDiff('a\nb', 'a')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
    ]);
    expect(lineDiff('', 'x')).toEqual([{ kind: 'add', text: 'x' }]);
    expect(lineDiff('x', '')).toEqual([{ kind: 'del', text: 'x' }]);
    expect(lineDiff('', '')).toEqual([]);
  });

  test('keeps the longest common run of lines', () => {
    const d = lineDiff('1\n2\n3\n4', '2\n4\n5');
    expect(d.filter((l) => l.kind === 'same').map((l) => l.text)).toEqual(['2', '4']);
    expect(d.filter((l) => l.kind === 'del').map((l) => l.text)).toEqual(['1', '3']);
    expect(d.filter((l) => l.kind === 'add').map((l) => l.text)).toEqual(['5']);
  });
});
