import type { Llm, LlmRequest, LlmResult } from '@/core/ports';
import type {
  DisputeReply, GeneratedBlock, GeneratedItem, GeneratedParagraph, GeneratedSession, GradeResult, RuleDraft, ValidationResult,
} from '@/core/llm/types';

/** Canned, valid model outputs for preview mode. They are derived from the request text so they pass the code checks. */

const SECTION = 'Ловушки';

interface Bank {
  gap: { prompt: string; expected: string }[];
  fix: { prompt: string; expected: string }[];
  spot: { text: string; errors: { wrong: string; correction: string }[] };
}

const BANKS: Record<string, Bank> = {
  articles: {
    gap: [
      { prompt: 'She bought ___ umbrella yesterday.', expected: 'an' },
      { prompt: 'He is ___ best player in the team.', expected: 'the' },
      { prompt: 'I need ___ hour to finish this.', expected: 'an' },
    ],
    fix: [
      { prompt: 'She is an teacher at a local school.', expected: 'a teacher' },
      { prompt: 'The sun rises in the east.', expected: '✓' },
      { prompt: 'I saw a elephant at the zoo.', expected: 'an elephant' },
    ],
    spot: {
      text: 'Yesterday I met a old friend at the station. He works as an engineer in the large company. We talked for a hour and then took the bus to a city centre. He has a idea about opening a cafe.',
      errors: [
        { wrong: 'a old', correction: 'an old' },
        { wrong: 'the large company', correction: 'a large' },
        { wrong: 'a hour', correction: 'an hour' },
        { wrong: 'a city centre', correction: 'the city' },
        { wrong: 'a idea', correction: 'an idea' },
      ],
    },
  },
  conditionals: {
    gap: [
      { prompt: 'If it ___ tomorrow, we will stay at home.', expected: 'rains' },
      { prompt: 'If she ___ early, we will start the meeting.', expected: 'comes' },
      { prompt: 'If they leave now, they ___ the train.', expected: 'will catch' },
    ],
    fix: [
      { prompt: 'If she will come, we will start.', expected: 'comes' },
      { prompt: 'If it rains, we stay at home.', expected: '✓' },
      { prompt: 'If I would have time, I will call you.', expected: 'have' },
    ],
    spot: {
      text: 'If it will rain tomorrow, we stay at home. If she comes late, we will to start without her. If I would have time, I will call you. If they leave now, they catch the train. If he will win, we will celebrate.',
      errors: [
        { wrong: 'will rain', correction: 'rains' },
        { wrong: 'we stay', correction: 'will stay' },
        { wrong: 'will to start', correction: 'will start' },
        { wrong: 'would have', correction: 'have' },
        { wrong: 'will win', correction: 'wins' },
      ],
    },
  },
  'present-perfect': {
    gap: [
      { prompt: 'I ___ lived here for two years.', expected: 'have' },
      { prompt: 'She ___ just finished her report.', expected: 'has' },
      { prompt: 'They have ___ the film already.', expected: 'seen' },
    ],
    fix: [
      { prompt: 'I have seen him yesterday.', expected: 'saw' },
      { prompt: 'She has lived here since 2020.', expected: '✓' },
      { prompt: 'We have went to the museum.', expected: 'have gone' },
    ],
    spot: {
      text: 'I have visited Rome last year. She has lived here since five years. They have went home already. He has not finish his work yet. We have met in 2019.',
      errors: [
        { wrong: 'have visited', correction: 'visited' },
        { wrong: 'since five', correction: 'for five' },
        { wrong: 'have went', correction: 'have gone' },
        { wrong: 'not finish', correction: 'not finished' },
        { wrong: 'have met', correction: 'met' },
      ],
    },
  },
  'third-person-s': {
    gap: [
      { prompt: 'He ___ to work by bus every day.', expected: 'goes' },
      { prompt: 'She always ___ tea in the morning.', expected: 'drinks' },
      { prompt: 'The shop ___ at nine.', expected: 'opens' },
    ],
    fix: [
      { prompt: 'He work late on Fridays.', expected: 'works' },
      { prompt: 'She likes tea.', expected: '✓' },
      { prompt: 'My brother play football every week.', expected: 'plays' },
    ],
    spot: {
      text: 'My brother live in London and work in a bank. He usually get up at six. His wife teach at a school. She love her job. They both enjoys the weekend.',
      errors: [
        { wrong: 'live in', correction: 'lives' },
        { wrong: 'work in', correction: 'works' },
        { wrong: 'get up', correction: 'gets' },
        { wrong: 'teach at', correction: 'teaches' },
        { wrong: 'love her', correction: 'loves' },
      ],
    },
  },
};

const FALLBACK = 'articles';
const bankFor = (key: string): Bank => BANKS[key] ?? (BANKS[FALLBACK] as Bank);

const item = (b: { prompt: string; expected: string }, topicKey: string, isCheck: boolean): GeneratedItem => ({
  prompt: b.prompt, expected: b.expected, topicKey, ruleSection: SECTION, isCheck,
});

function reviewBlock(allowed: string[], due: string[]): GeneratedBlock {
  const keys = due.length > 0 ? due : allowed.slice(0, 1);
  const items = keys.flatMap((k) => bankFor(k).fix.map((f) => item(f, k, f === bankFor(k).fix[0])));
  return {
    kind: 'review', format: 'fix', title: 'Повторение',
    instruction: 'Напишите ✓, если предложение верно, иначе исправленный фрагмент.',
    formatExample: 'If it rains, we stay at home. → ✓', minutes: 5,
    items: items.slice(0, Math.max(12, keys.length)), paragraphs: [], question: '',
  };
}

function taskBlock(format: string, key: string): GeneratedBlock {
  const bank = bankFor(key);
  const base = { kind: 'task' as const, minutes: 10, question: '' };
  if (format === 'spot') {
    const paragraph: GeneratedParagraph = {
      text: bank.spot.text,
      errors: bank.spot.errors.map((e) => ({ ...e, topicKey: key, ruleSection: SECTION })),
    };
    return {
      ...base, format: 'spot', title: 'Найдите ошибки',
      instruction: 'Каждое исправление на отдельной строке: было → стало.',
      formatExample: 'He go home → goes', items: [], paragraphs: [paragraph],
    };
  }
  if (format === 'fix') {
    return {
      ...base, format: 'fix', title: 'Задание дня',
      instruction: 'Напишите ✓, если предложение верно, иначе исправленный фрагмент.',
      formatExample: 'If it rains, we stay at home. → ✓', items: bank.fix.map((f) => item(f, key, false)), paragraphs: [],
    };
  }
  return {
    ...base, format: 'gap', title: 'Задание дня',
    instruction: 'Впишите пропущенное слово.',
    formatExample: 'She ___ tea. → drinks', items: bank.gap.map((g) => item(g, key, false)), paragraphs: [],
  };
}

function generate(prompt: string): GeneratedSession {
  const allowed = [...(prompt.split('## Topic keys allowed')[1] ?? '').matchAll(/^- (\S+)$/gm)].map((m) => m[1] as string);
  const due = (/in the review block: ([^.\n]+)\./.exec(prompt)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const blocks: GeneratedBlock[] = [];
  for (const m of prompt.matchAll(/^\d+\. (review|task|speaking) \(format ([^,)]+)(?:, topic ([^)]+))?\)$/gm)) {
    const [, kind, format, topic] = m;
    if (kind === 'review') blocks.push(reviewBlock(allowed, due));
    else if (kind === 'task') blocks.push(taskBlock(format as string, topic ?? allowed[0] ?? FALLBACK));
    else {
      blocks.push({
        kind: 'speaking', format: 'question', title: 'Говорение',
        instruction: 'Ответьте вслух за одну-две минуты.', formatExample: '', minutes: 3,
        items: [], paragraphs: [], question: 'Describe a time when you had to make a quick decision.',
      });
    }
  }
  return { blocks };
}

function validate(prompt: string): ValidationResult {
  const refs = [...prompt.matchAll(/ref (b\d+\.(?:i\d+|p\d+\.e\d+)) \|/g)].map((m) => m[1] as string);
  return { items: refs.map((ref) => ({ ref, ok: true, reason: '' })) };
}

function field(block: string, name: string): string {
  return new RegExp(`^${name}: ?(.*)$`, 'm').exec(block)?.[1]?.trim() ?? '';
}

function grade(prompt: string): GradeResult {
  const result: GradeResult = { items: [], spot: [], patterns: [], tomorrow: [], spellingErrors: [], ruleGaps: [] };
  const [itemPart = '', spotPart = ''] = prompt.split('## Error-spotting paragraphs');
  for (const block of itemPart.split(/^### /m).slice(1)) {
    const ref = /^(b\d+\.i\d+)/.exec(block)?.[1];
    if (!ref || !block.includes('Learner answer:')) continue;
    const expected = field(block, 'Expected');
    const answer = field(block, 'Learner answer');
    const correct = answer.toLowerCase() === expected.toLowerCase();
    result.items.push({
      ref,
      verdict: correct ? 'correct' : 'wrong',
      fix: correct ? '' : expected,
      ruleSection: correct ? '' : field(block, 'Rule section'),
      explanation: correct ? '' : 'Здесь действует правило из раздела о ловушках: сверьтесь с формулой.',
      vocabularyNote: '',
      question: '',
    });
  }
  for (const block of spotPart.split(/^### /m).slice(1)) {
    const head = /^(b\d+) paragraph (\d+)/.exec(block);
    if (!head) continue;
    const learner = block.split('Learner lines (wrong → right):')[1]?.split('Hidden errors:')[0]?.toLowerCase() ?? '';
    const errors = [...block.matchAll(/^- (b\d+\.p\d+\.e\d+) \| wrong fragment: "([^"]*)"/gm)];
    result.spot.push({
      blockRef: head[1] as string,
      paragraph: Number(head[2]),
      found: errors.filter((e) => learner.includes((e[2] as string).toLowerCase())).map((e) => e[1] as string),
      extra: [],
    });
  }
  if (result.items.some((i) => i.verdict === 'wrong')) {
    result.patterns = ['Форма глагола после if: настоящее время вместо будущего'];
    result.tomorrow = ['if + настоящее время в условных предложениях'];
  }
  return result;
}

function ruleDraft(): RuleDraft {
  return {
    body: [
      '## Формула', 'If + Present Simple, will + глагол.',
      '## Примеры', '- If it rains, we will stay at home.',
      '## Объяснение', 'В части с if будущее время не используется.',
      '## Ловушки', 'Нельзя писать if she will come.',
      '## Источники', '- British Council',
    ].join('\n\n'),
    sources: [{ title: 'British Council', url: 'https://learnenglish.britishcouncil.org/grammar' }],
  };
}

const dispute = (): DisputeReply => ({
  position: 'Правило допускает только указанный вариант.',
  ruleSection: SECTION,
  sources: [{ title: 'Cambridge Dictionary', url: 'https://dictionary.cambridge.org/grammar/british-grammar/' }],
  recommendation: 'keep',
});

export const previewLlm: Llm = {
  async call(req: LlmRequest): Promise<LlmResult<unknown>> {
    let data: unknown;
    switch (req.kind) {
      case 'generate_session': data = generate(req.userPrompt); break;
      case 'validate_session': data = validate(req.userPrompt); break;
      case 'grade': data = grade(req.userPrompt); break;
      case 'rule_draft': data = ruleDraft(); break;
      case 'dispute': data = dispute(); break;
    }
    return { ok: true, data, costUsd: 0, durationMs: 5, raw: JSON.stringify(data) };
  },
};
