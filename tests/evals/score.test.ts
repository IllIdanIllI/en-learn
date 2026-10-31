import { describe, expect, test } from 'vitest';
import { normaliseFix, scoreEval, type CaseResult, type GradeCase } from '../../evals/score';

const base = { topic: 'articles', format: 'gap' as const, prompt: 'p', expected: 'e', ruleSection: 'Формула', answer: 'a', category: 'c', why: 'w' };
const mk = (id: string, verdict: GradeCase['label']['verdict'], extra: Partial<GradeCase['label']> = {}): GradeCase => ({
  ...base, id, label: { verdict, ...extra },
});
const res = (id: string, verdict: CaseResult['verdict'], extra: Partial<CaseResult> = {}): CaseResult => ({
  id, verdict, fix: '', toneViolations: 0, ...extra,
});

describe('normaliseFix', () => {
  test('ignores case, outer whitespace, trailing punctuation and curly apostrophes', () => {
    expect(normaliseFix('  Haven’t  Paid. ')).toBe("haven't paid");
  });
});

describe('scoreEval', () => {
  const cases = [mk('a', 'correct'), mk('b', 'correct'), mk('c', 'wrong', { fix: ['an'] }), mk('d', 'rule_gap'), mk('e', 'needs_clarification')];

  test('overall and per expected verdict accuracy', () => {
    const s = scoreEval(
      [res('a', 'correct'), res('b', 'wrong'), res('c', 'wrong', { fix: 'an' }), res('d', 'wrong'), res('e', 'needs_clarification')],
      cases,
    );
    expect(s.total).toBe(5);
    expect(s.correct).toBe(3);
    expect(s.accuracy).toBeCloseTo(0.6);
    expect(s.perVerdict.correct).toEqual({ total: 2, correct: 1, accuracy: 0.5, got: { correct: 1, wrong: 1 } });
    expect(s.perVerdict.wrong.accuracy).toBe(1);
    expect(s.perVerdict.rule_gap).toEqual({ total: 1, correct: 0, accuracy: 0, got: { wrong: 1 } });
    expect(s.mismatches.map((m) => [m.id, m.expected, m.got])).toEqual([['b', 'correct', 'wrong'], ['d', 'rule_gap', 'wrong']]);
  });

  test('a verdict with no cases has null accuracy', () => {
    const s = scoreEval([res('a', 'correct')], [mk('a', 'correct')]);
    expect(s.perVerdict.wrong).toEqual({ total: 0, correct: 0, accuracy: null, got: {} });
  });

  test('a missing result counts as an error and is listed', () => {
    const s = scoreEval([res('a', 'correct')], [mk('a', 'correct'), mk('b', 'wrong')]);
    expect(s.missing).toEqual(['b']);
    expect(s.errors).toBe(1);
    expect(s.accuracy).toBe(0.5);
    expect(s.perVerdict.wrong.got).toEqual({ error: 1 });
  });

  test('a result for an unknown case is a data bug', () => {
    expect(() => scoreEval([res('zzz', 'correct')], [mk('a', 'correct')])).toThrow(/zzz/);
  });

  test('defect and error verdicts never match a label', () => {
    const s = scoreEval([res('a', 'defect'), res('b', 'error')], [mk('a', 'correct'), mk('b', 'wrong')]);
    expect(s.correct).toBe(0);
    expect(s.errors).toBe(1);
    expect(s.perVerdict.correct.got).toEqual({ defect: 1 });
  });

  test('fix accuracy counts only labelled fixes on items graded wrong, and accepts any listed alternative', () => {
    const cs = [mk('a', 'wrong', { fix: ['an', 'an engineer'] }), mk('b', 'wrong', { fix: ['films'] }), mk('c', 'wrong', { fix: ['x'] }), mk('d', 'wrong')];
    const s = scoreEval(
      [res('a', 'wrong', { fix: 'An engineer.' }), res('b', 'wrong', { fix: 'film' }), res('c', 'correct'), res('d', 'wrong', { fix: 'anything' })],
      cs,
    );
    expect(s.fix).toEqual({ checked: 2, matched: 1, accuracy: 0.5 });
  });

  test('tone: counts items with a violation and all violations', () => {
    const s = scoreEval(
      [res('a', 'correct', { toneViolations: 2 }), res('b', 'correct'), res('c', 'wrong', { toneViolations: 1 }), res('d', 'rule_gap'), res('e', 'needs_clarification')],
      cases,
    );
    expect(s.tone).toEqual({ itemsWithViolations: 2, violations: 3, items: 5 });
  });

  test('spelling flags: counted only for cases that label spellingErrors', () => {
    const cs = [mk('a', 'correct', { spellingErrors: ['engineer'] }), mk('b', 'correct', { spellingErrors: ['paid'] }), mk('c', 'correct')];
    const s = scoreEval([res('a', 'correct', { spellingFlagged: true }), res('b', 'correct', { spellingFlagged: false }), res('c', 'correct')], cs);
    expect(s.spelling).toEqual({ checked: 2, flagged: 1 });
  });

  test('defect is an expected verdict of its own', () => {
    const s = scoreEval([res('a', 'defect'), res('b', 'correct')], [mk('a', 'defect'), mk('b', 'defect')]);
    expect(s.perVerdict.defect).toEqual({ total: 2, correct: 1, accuracy: 0.5, got: { defect: 1, correct: 1 } });
  });

  test('a label fix may be the ending of the model fix', () => {
    const s = scoreEval([res('a', 'wrong', { fix: 'I have written' }), res('b', 'wrong', { fix: 'unhave written' })], [mk('a', 'wrong', { fix: ['have written'] }), mk('b', 'wrong', { fix: ['have written'] })]);
    expect(s.fix).toEqual({ checked: 2, matched: 1, accuracy: 0.5 });
  });

  test('code-graded spelling cases are reported apart from model accuracy, per-verdict and tone', () => {
    const sp = { ...mk('s1', 'wrong'), format: 'spelling' as const, topic: null };
    const sp2 = { ...mk('s2', 'correct'), format: 'spelling' as const, topic: null };
    const s = scoreEval(
      [res('a', 'correct'), res('s1', 'wrong', { toneViolations: 3 }), res('s2', 'wrong')],
      [mk('a', 'correct'), sp, sp2],
    );
    expect(s.total).toBe(1);
    expect(s.accuracy).toBe(1);
    expect(s.perVerdict.wrong.total).toBe(0);
    expect(s.tone).toEqual({ items: 1, itemsWithViolations: 0, violations: 0 });
    expect(s.codeGraded).toEqual({ total: 2, correct: 1 });
    expect(s.mismatches.map((m) => m.id)).toEqual(['s2']);
  });

  test('empty input gives null accuracy', () => {
    const s = scoreEval([], []);
    expect(s.total).toBe(0);
    expect(s.accuracy).toBeNull();
  });
});
