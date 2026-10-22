/** Pure scoring of the grading suite: what the model said per case, against the learner-reviewed labels. */

export type ExpectedVerdict = 'correct' | 'wrong' | 'rule_gap' | 'needs_clarification';
/** What the model returned; 'error' = the call failed or the item was not in the answer. */
export type GotVerdict = ExpectedVerdict | 'defect' | 'error';

export const EXPECTED_VERDICTS: readonly ExpectedVerdict[] = ['correct', 'wrong', 'rule_gap', 'needs_clarification'];

export interface GradeCase {
  id: string;
  /** Topic key of the rule that decides it; null for spelling items (graded by code). */
  topic: string | null;
  format: 'gap' | 'fix' | 'spelling';
  prompt: string;
  expected: string;
  /** Heading of the deciding rule section, as the app passes it to the model. */
  ruleSection: string;
  answer: string;
  category: string;
  label: {
    verdict: ExpectedVerdict;
    /** Acceptable fixes when the verdict is 'wrong'. */
    fix?: string[];
    /** Correctly spelled words the model should list in spellingErrors. */
    spellingErrors?: string[];
  };
  why: string;
}

export interface CaseResult {
  id: string;
  verdict: GotVerdict;
  fix: string;
  /** Tone violations in this item's own prose, in the model's first response (before the app's retry). */
  toneViolations: number;
  /** For cases that label spellingErrors: did the response list them. */
  spellingFlagged?: boolean;
}

export interface VerdictStats {
  total: number;
  correct: number;
  accuracy: number | null;
  got: Partial<Record<GotVerdict, number>>;
}

export interface EvalScore {
  total: number;
  correct: number;
  accuracy: number | null;
  perVerdict: Record<ExpectedVerdict, VerdictStats>;
  fix: { checked: number; matched: number; accuracy: number | null };
  tone: { items: number; itemsWithViolations: number; violations: number };
  spelling: { checked: number; flagged: number };
  errors: number;
  missing: string[];
  mismatches: { id: string; expected: ExpectedVerdict; got: GotVerdict; expectedFix?: string[]; gotFix?: string }[];
}

export function normaliseFix(s: string): string {
  return s.trim().toLowerCase().replaceAll('’', "'").replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '');
}

const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);

export function scoreEval(results: CaseResult[], cases: GradeCase[]): EvalScore {
  const byId = new Map(cases.map((c) => [c.id, c]));
  for (const r of results) if (!byId.has(r.id)) throw new Error(`Result for unknown case ${r.id}`);
  const resultOf = new Map(results.map((r) => [r.id, r]));

  const perVerdict = Object.fromEntries(
    EXPECTED_VERDICTS.map((v) => [v, { total: 0, correct: 0, accuracy: null, got: {} } as VerdictStats]),
  ) as Record<ExpectedVerdict, VerdictStats>;
  const out: EvalScore = {
    total: cases.length, correct: 0, accuracy: null, perVerdict,
    fix: { checked: 0, matched: 0, accuracy: null },
    tone: { items: cases.length, itemsWithViolations: 0, violations: 0 },
    spelling: { checked: 0, flagged: 0 },
    errors: 0, missing: [], mismatches: [],
  };

  for (const c of cases) {
    const r = resultOf.get(c.id);
    if (!r) out.missing.push(c.id);
    const got: GotVerdict = r?.verdict ?? 'error';
    const expected = c.label.verdict;
    const stats = perVerdict[expected];
    stats.total++;
    stats.got[got] = (stats.got[got] ?? 0) + 1;
    if (got === 'error') out.errors++;
    if (got === expected) {
      stats.correct++;
      out.correct++;
    } else {
      out.mismatches.push({ id: c.id, expected, got, ...(c.label.fix ? { expectedFix: c.label.fix } : {}), ...(r?.fix ? { gotFix: r.fix } : {}) });
    }
    if (expected === 'wrong' && c.label.fix && got === 'wrong' && r) {
      out.fix.checked++;
      if (c.label.fix.some((f) => normaliseFix(f) === normaliseFix(r.fix))) out.fix.matched++;
    }
    if (r && r.toneViolations > 0) {
      out.tone.itemsWithViolations++;
      out.tone.violations += r.toneViolations;
    }
    if (c.label.spellingErrors) {
      out.spelling.checked++;
      if (r?.spellingFlagged === true) out.spelling.flagged++;
    }
  }
  for (const v of EXPECTED_VERDICTS) perVerdict[v].accuracy = ratio(perVerdict[v].correct, perVerdict[v].total);
  out.accuracy = ratio(out.correct, out.total);
  out.fix.accuracy = ratio(out.fix.matched, out.fix.checked);
  return out;
}
