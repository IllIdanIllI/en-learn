import { describe, expect, test } from 'vitest';
import { isCopyLogShortcut } from '@/ui/debug/useCopyLogShortcut';

const press = (over: Partial<Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>>) => ({
  key: 'l',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe('isCopyLogShortcut', () => {
  test('Cmd+Shift+L on Mac', () => {
    expect(isCopyLogShortcut(press({ metaKey: true, shiftKey: true }), true)).toBe(true);
  });

  test('Ctrl+Shift+L off the Mac, with either case of the key', () => {
    expect(isCopyLogShortcut(press({ key: 'L', ctrlKey: true, shiftKey: true }), false)).toBe(true);
  });

  test('needs Shift', () => {
    expect(isCopyLogShortcut(press({ metaKey: true }), true)).toBe(false);
    expect(isCopyLogShortcut(press({ ctrlKey: true }), false)).toBe(false);
  });

  test('Alt makes it another shortcut', () => {
    expect(isCopyLogShortcut(press({ metaKey: true, shiftKey: true, altKey: true }), true)).toBe(false);
    expect(isCopyLogShortcut(press({ ctrlKey: true, shiftKey: true, altKey: true }), false)).toBe(false);
  });

  test('Ctrl on Mac and Meta off the Mac do not match', () => {
    expect(isCopyLogShortcut(press({ ctrlKey: true, shiftKey: true }), true)).toBe(false);
    expect(isCopyLogShortcut(press({ metaKey: true, shiftKey: true }), false)).toBe(false);
  });

  test('another key does not match', () => {
    expect(isCopyLogShortcut(press({ key: 'k', metaKey: true, shiftKey: true }), true)).toBe(false);
  });
});
