import type { ViewBlock } from '@/core/session/view';

/** The speaking question: text only in S1, no input and no grading. */
export function QuestionBlock({ block }: { block: ViewBlock }) {
  return <p className="reading">{block.question}</p>;
}
