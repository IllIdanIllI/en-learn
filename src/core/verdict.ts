import type { DisputeDecision, EffectiveVerdict, GapStatus, ItemStatus, Verdict } from '@/core/domain';

export function effectiveVerdict(a: {
  itemStatus: ItemStatus;
  verdict: Verdict;
  disputeDecision: DisputeDecision | null;
  gapStatus: GapStatus | null;
}): EffectiveVerdict {
  if (a.itemStatus === 'dropped' || a.itemStatus === 'defect' || a.disputeDecision === 'drop') return null;
  if (a.disputeDecision === 'correct') return 'correct';
  if (a.verdict === 'rule_gap') return a.gapStatus === 'approved' ? 'correct' : null;
  if (a.verdict === 'skipped') return null;
  return a.verdict;
}
