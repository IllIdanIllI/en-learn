import { describe, expect, test } from 'vitest';
import { precheckAnswers } from '@/core/grading/precheck';

const items = [{ id: 1, format: 'gap' as const }];
const run = (answer: string) => precheckAnswers({ items: { 1: answer }, spot: {} }, items, ['✓']);

describe('precheckAnswers', () => {
  test('blank answer asks', () => {
    expect(run('  ')).toEqual([{ itemId: 1, kind: 'blank' }]);
    expect(precheckAnswers({ items: {}, spot: {} }, items, ['✓'])).toEqual([{ itemId: 1, kind: 'blank' }]);
  });
  test('unknown symbol asks about shorthand', () => {
    expect(run('~')).toEqual([{ itemId: 1, kind: 'shorthand', symbol: '~' }]);
  });
  test('built-in + and ✓ are never asked about', () => {
    expect(precheckAnswers({ items: { 1: '+' }, spot: {} }, items, [])).toEqual([]);
  });
  test('accepted shorthand passes', () => {
    expect(run('✓')).toEqual([]);
  });
  test('symbol with words is not a shorthand', () => {
    expect(run('✓ but')).toEqual([]);
  });
  test('spot items are not checked per item', () => {
    expect(precheckAnswers({ items: {}, spot: {} }, [{ id: 2, format: 'spot' }], ['✓'])).toEqual([]);
  });
});
