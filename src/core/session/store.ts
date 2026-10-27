import type { Db } from '@/core/ports';
import type { GeneratedSession } from '@/core/llm/types';
import { t, type Lang } from '@/core/i18n';
import { normaliseTopicKey } from '@/core/validate/taskChecks';
import { insertBlock, insertItem, type NewItem } from '@/core/db/repos/sessions';
import type { SpellingWord } from '@/core/db/repos/spelling';
import type { GenerationContext } from './context';
import type { Defects } from './validation';

const SPELLING_WORDS_PER_MINUTE = 3;

/** Writes the blocks and items of a draft session: the spelling block first, then the generated blocks. */
export async function writeBlocks(
  db: Db,
  sessionId: number,
  lang: Lang,
  ctx: GenerationContext,
  gen: GeneratedSession,
  defects: Defects,
  spelling: SpellingWord[],
): Promise<void> {
  const byKey = new Map(ctx.allowed.map((r) => [normaliseTopicKey(r.topic.key), r]));
  let ord = 0;

  if (spelling.length > 0) {
    const blockId = await insertBlock(db, sessionId, ord++, {
      kind: 'spelling',
      format: 'spelling',
      title: t(lang, 'spelling.title'),
      instruction: t(lang, 'spelling.instruction'),
      formatExample: null,
      passage: null,
      minutes: Math.ceil(spelling.length / SPELLING_WORDS_PER_MINUTE),
    });
    let i = 0;
    for (const w of spelling) {
      await insertItem(db, blockId, i++, {
        prompt: w.hint ?? '', expected: w.word, paragraph: null, topicId: null, ruleId: null, ruleVersion: null,
        ruleSection: null, spellingWordId: w.id, isCheck: false, status: 'active', note: null, wrong: null,
      });
    }
  }

  const linked = (ref: string, topicKey: string, ruleSection: string, base: Pick<NewItem, 'prompt' | 'expected' | 'paragraph' | 'isCheck' | 'wrong'>): NewItem => {
    const r = byKey.get(normaliseTopicKey(topicKey));
    const reason = defects.get(ref);
    return {
      ...base,
      topicId: r?.topic.id ?? null,
      ruleId: r?.ruleId ?? null,
      ruleVersion: r?.version ?? null,
      ruleSection,
      spellingWordId: null,
      status: reason === undefined ? 'active' : 'defect',
      note: reason ?? null,
    };
  };

  for (const [bi, b] of gen.blocks.entries()) {
    const blockId = await insertBlock(db, sessionId, ord++, {
      kind: b.kind,
      format: b.format,
      title: b.title,
      instruction: b.instruction,
      formatExample: b.formatExample === '' ? null : b.formatExample,
      // A speaking block keeps its question text here; a spot block keeps its paragraphs as a JSON array.
      passage: b.format === 'spot' ? JSON.stringify(b.paragraphs.map((p) => p.text)) : b.format === 'question' ? b.question : null,
      minutes: b.minutes,
    });
    let i = 0;
    for (const [ii, it] of b.items.entries()) {
      await insertItem(db, blockId, i++, linked(`b${bi}.i${ii}`, it.topicKey, it.ruleSection, {
        prompt: it.prompt, expected: it.expected, paragraph: null, isCheck: it.isCheck,
        wrong: b.format === 'fix' && it.wrong !== '' ? it.wrong : null,
      }));
    }
    for (const [pi, p] of b.paragraphs.entries()) {
      for (const [ei, e] of p.errors.entries()) {
        await insertItem(db, blockId, i++, linked(`b${bi}.p${pi}.e${ei}`, e.topicKey, e.ruleSection, {
          prompt: e.wrong, expected: e.correction, paragraph: pi, isCheck: false, wrong: null,
        }));
      }
    }
  }
}
