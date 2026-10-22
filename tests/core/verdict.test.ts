import { describe, expect, test } from 'vitest';
import { effectiveVerdict } from '@/core/verdict';

const base = { itemStatus: 'active', verdict: 'wrong', disputeDecision: null, gapStatus: null } as const;

describe('effectiveVerdict', () => {
  test('defect item is not counted', () => {
    expect(effectiveVerdict({ ...base, itemStatus: 'defect' })).toBeNull();
  });
  test('dropped item is not counted', () => {
    expect(effectiveVerdict({ ...base, itemStatus: 'dropped' })).toBeNull();
  });
  test('dispute drop is not counted', () => {
    expect(effectiveVerdict({ ...base, disputeDecision: 'drop' })).toBeNull();
  });
  test('dispute correct turns wrong into correct', () => {
    expect(effectiveVerdict({ ...base, disputeDecision: 'correct' })).toBe('correct');
  });
  test('dispute keep leaves the stored verdict', () => {
    expect(effectiveVerdict({ ...base, disputeDecision: 'keep' })).toBe('wrong');
  });
  test('rule_gap approved is correct', () => {
    expect(effectiveVerdict({ ...base, verdict: 'rule_gap', gapStatus: 'approved' })).toBe('correct');
  });
  test('rule_gap pending or rejected is not counted', () => {
    expect(effectiveVerdict({ ...base, verdict: 'rule_gap', gapStatus: 'pending' })).toBeNull();
    expect(effectiveVerdict({ ...base, verdict: 'rule_gap', gapStatus: 'rejected' })).toBeNull();
  });
  test('skipped is not counted', () => {
    expect(effectiveVerdict({ ...base, verdict: 'skipped' })).toBeNull();
  });
  test('plain wrong stays wrong, plain correct stays correct', () => {
    expect(effectiveVerdict(base)).toBe('wrong');
    expect(effectiveVerdict({ ...base, verdict: 'correct' })).toBe('correct');
  });
});
