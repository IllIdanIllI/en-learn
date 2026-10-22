import { describe, expect, test } from 'vitest';
import { findSection } from '@/ui/today/ruleSection';

const sections = ['Формула', 'Примеры', 'Объяснение', 'Ловушки', 'Источники'];

describe('findSection', () => {
  test('matches a heading exactly, ignoring case and spacing', () => {
    expect(findSection(sections, 'Ловушки')).toBe(3);
    expect(findSection(sections, '  ловушки ')).toBe(3);
  });

  test('ignores a leading section sign and number', () => {
    expect(findSection(sections, '§ Ловушки')).toBe(3);
    expect(findSection(['Formula', 'Traps'], '§2 Traps')).toBe(1);
    expect(findSection(['Formula', 'Traps'], '2. Traps')).toBe(1);
  });

  test('falls back to a heading that contains the wanted text', () => {
    expect(findSection(['Formula', 'Traps and exceptions'], 'Traps')).toBe(1);
  });

  test('returns -1 when nothing matches or the wanted text is empty', () => {
    expect(findSection(sections, 'Nothing')).toBe(-1);
    expect(findSection(sections, '')).toBe(-1);
  });
});
