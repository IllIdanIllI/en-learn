import { describe, expect, test } from 'vitest';
import { isCopyLogShortcut } from '@/ui/debug/useCopyLogShortcut';

const press = (over: Partial<Pick<KeyboardEvent, 'code' | 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>>) => ({
  code: 'KeyL',
  key: 'l',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe('isCopyLogShortcut', () => {
  test('Cmd+Option+L on Mac', () => {
    expect(isCopyLogShortcut(press({ metaKey: true, altKey: true }), true)).toBe(true);
  });

  test('Ctrl+Alt+L off the Mac', () => {
    expect(isCopyLogShortcut(press({ ctrlKey: true, altKey: true }), false)).toBe(true);
  });

  test('matches the key by code, so Option changing the character still works', () => {
    expect(isCopyLogShortcut(press({ key: '¬', code: 'KeyL', metaKey: true, altKey: true }), true)).toBe(true);
  });

  test('Shift makes it another shortcut', () => {
    expect(isCopyLogShortcut(press({ metaKey: true, altKey: true, shiftKey: true }), true)).toBe(false);
    expect(isCopyLogShortcut(press({ ctrlKey: true, altKey: true, shiftKey: true }), false)).toBe(false);
  });

  test('needs Alt', () => {
    expect(isCopyLogShortcut(press({ metaKey: true }), true)).toBe(false);
    expect(isCopyLogShortcut(press({ ctrlKey: true }), false)).toBe(false);
  });

  test('Ctrl on Mac and Meta off the Mac do not match', () => {
    expect(isCopyLogShortcut(press({ ctrlKey: true, altKey: true }), true)).toBe(false);
    expect(isCopyLogShortcut(press({ metaKey: true, altKey: true }), false)).toBe(false);
  });

  test('a held key (repeat) does not match', () => {
    expect(isCopyLogShortcut({ ...press({ metaKey: true, altKey: true }), repeat: true }, true)).toBe(false);
  });

  test('another key does not match', () => {
    expect(isCopyLogShortcut(press({ code: 'KeyK', key: 'k', metaKey: true, altKey: true }), true)).toBe(false);
  });
});
