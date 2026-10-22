export type ISODate = string;
export type TopicKind = 'learn' | 'notice';
export type Slot = 'error_spotting' | 'topic' | 'second_set' | 'speaking' | 'writing' | 'review_rewrite' | 'rest';
export type BlockKind = 'spelling' | 'review' | 'task' | 'speaking';
export type BlockFormat = 'gap' | 'fix' | 'spot' | 'spelling' | 'question';
export type ItemStatus = 'active' | 'dropped' | 'defect';
export type Verdict = 'correct' | 'wrong' | 'rule_gap' | 'skipped';
export type DisputeDecision = 'keep' | 'correct' | 'drop';
export type GapStatus = 'pending' | 'approved' | 'rejected';
export type SessionStatus = 'draft' | 'generated' | 'graded';
export type EffectiveVerdict = 'correct' | 'wrong' | null;   // null = not counted
export type LlmKind = 'rule_draft' | 'generate_session' | 'validate_session' | 'grade' | 'dispute';
export interface Topic { id: number; key: string; title: string; kind: TopicKind; weekNo: number | null; archived: boolean }
export interface Programme { id: number; title: string; startDate: ISODate; endDate: ISODate }
export interface DayPlan { kind: 'normal' | 'rest' | 'review_only'; weekNo: number | null; slot: Slot | null;
  task: { format: 'gap' | 'fix' | 'spot'; topicId: number | null } | null }
