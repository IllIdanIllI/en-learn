import type { LlmKind } from '@/core/domain';
import ruleDraftMd from '../../../prompts/rule_draft.md?raw';
import ruleDraftSchema from '../../../prompts/rule_draft.schema.json';
import ruleChatMd from '../../../prompts/rule_chat.md?raw';
import ruleChatSchema from '../../../prompts/rule_chat.schema.json';
import generateSessionMd from '../../../prompts/generate_session.md?raw';
import generateSessionSchema from '../../../prompts/generate_session.schema.json';
import validateSessionMd from '../../../prompts/validate_session.md?raw';
import validateSessionSchema from '../../../prompts/validate_session.schema.json';
import gradeMd from '../../../prompts/grade.md?raw';
import gradeSchema from '../../../prompts/grade.schema.json';
import disputeMd from '../../../prompts/dispute.md?raw';
import disputeSchema from '../../../prompts/dispute.schema.json';

export interface PromptFiles { system: string; schema: object }

/** Built once at module load: schema objects are stable, so callStructured's WeakMap validator cache hits. */
export const bundledPrompts: Record<LlmKind, PromptFiles> = {
  rule_draft: { system: ruleDraftMd, schema: ruleDraftSchema },
  rule_chat: { system: ruleChatMd, schema: ruleChatSchema },
  generate_session: { system: generateSessionMd, schema: generateSessionSchema },
  validate_session: { system: validateSessionMd, schema: validateSessionSchema },
  grade: { system: gradeMd, schema: gradeSchema },
  dispute: { system: disputeMd, schema: disputeSchema },
};
