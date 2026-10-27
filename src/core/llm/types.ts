export interface Source { title: string; url: string }

export interface GeneratedItem {
  prompt: string;
  expected: string;
  topicKey: string;
  ruleSection: string;
  isCheck: boolean;
  wrong: string;
}

export interface GeneratedParagraph {
  text: string;
  errors: { wrong: string; correction: string; topicKey: string; ruleSection: string }[];
}

export interface GeneratedBlock {
  kind: 'review' | 'task' | 'speaking';
  format: 'gap' | 'fix' | 'spot' | 'question';
  title: string;
  instruction: string;
  formatExample: string;
  minutes: number;
  items: GeneratedItem[];
  paragraphs: GeneratedParagraph[];
  question: string;
}

export interface GeneratedSession { blocks: GeneratedBlock[] }

/** ref = "b<blockIndex>.i<itemIndex>" or "b<blockIndex>.p<paragraphIndex>.e<errorIndex>" (0-based) */
export interface ValidationResult { items: { ref: string; ok: boolean; reason: string }[] }

export type Verdict = 'correct' | 'wrong' | 'rule_gap' | 'defect' | 'needs_clarification';

export interface GradeResult {
  items: {
    ref: string;
    verdict: Verdict;
    fix: string;
    ruleSection: string;
    explanation: string;
    vocabularyNote: string;
    question: string;
  }[];
  spot: { blockRef: string; paragraph: number; found: string[]; extra: { text: string; explanation: string }[] }[];
  patterns: string[];
  tomorrow: string[];
  spellingErrors: { word: string; hint: string }[];
  ruleGaps: { ref: string; ruleTopicKey: string; proposal: string; explanation: string; sources: Source[] }[];
}

export interface RuleDraft { body: string; sources: Source[] }

export interface DisputeReply {
  position: string;
  ruleSection: string;
  sources: Source[];
  recommendation: 'keep' | 'correct' | 'drop';
}

export interface DisputeBatchReply { replies: (DisputeReply & { ref: string })[] }
