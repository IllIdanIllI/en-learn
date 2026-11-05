/** Optimal string alignment distance: insertions, deletions, substitutions and swaps of neighbours each cost 1. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

/**
 * Whether the learner wrote a misspelling of `word`: a word of their text that differs from it by 1 letter (words of up to 4 letters)
 * or by 1–2 letters (longer words). A grader that lists a wrong word ("if" for "would") as a spelling error is not believed.
 */
export function wroteMisspelling(word: string, learnerText: string): boolean {
  const target = word.trim().toLowerCase();
  if (target === '') return false;
  const limit = target.length <= 4 ? 1 : 2;
  const words = learnerText.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  return words.some((w) => {
    if (w === target) return false;
    const n = distance(w, target);
    return n >= 1 && n <= limit;
  });
}
