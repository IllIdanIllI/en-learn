import type { ProgrammeInput, SeedRule } from '@/core/programme/setup';

/** Inline mini-seed for preview fixtures: three learn weeks and one background notice, starting Monday 2026-10-19. */
export const MINI_PROGRAMME: ProgrammeInput = {
  title: 'Preview programme',
  startDate: '2026-10-19',
  endDate: '2026-11-08',
  weeks: [
    { title: 'Articles', key: 'articles', kind: 'learn' },
    { title: 'Conditionals', key: 'conditionals', kind: 'learn' },
    { title: 'Present perfect', key: 'present-perfect', kind: 'learn' },
  ],
  background: [{ title: 'Third person s', key: 'third-person-s', kind: 'notice' }],
  slots: {
    1: 'error_spotting',
    2: 'topic',
    3: 'rest',
    4: 'second_set',
    5: 'speaking',
    6: 'writing',
    7: 'review_rewrite',
  },
};

const rule = (topicKey: string, formula: string, examples: string[], explanation: string, traps: string, source: string): SeedRule => ({
  topicKey,
  sources: [{ title: source, url: `https://example.com/${topicKey}` }],
  body: [
    '## Формула',
    formula,
    '## Примеры',
    examples.map((e) => `- ${e}`).join('\n'),
    '## Объяснение',
    explanation,
    '## Ловушки',
    traps,
    '## Источники',
    `- ${source}`,
  ].join('\n\n'),
});

export const MINI_RULES: SeedRule[] = [
  rule(
    'articles',
    'a / an + исчисляемое существительное в единственном числе; the для известного предмета.',
    ['She bought a car.', 'The car is red.', 'An hour passed.'],
    'Выбор a или an зависит от звука, а не от буквы.',
    'Перед словами с непроизносимой h ставится an: an hour.',
    'Cambridge Dictionary',
  ),
  rule(
    'conditionals',
    'If + Present Simple, will + глагол.',
    ['If it rains, we will stay at home.', 'If she comes, we will start.'],
    'В части с if будущее время не используется.',
    'Нельзя писать if she will come.',
    'British Council',
  ),
  rule(
    'present-perfect',
    'have / has + третья форма глагола.',
    ['I have lived here for two years.', 'She has finished her report.'],
    'Связывает прошлое действие с настоящим.',
    'С указанием конкретного времени (yesterday) используется Past Simple.',
    'British Council',
  ),
  rule(
    'third-person-s',
    'he / she / it + глагол с окончанием -s.',
    ['He works late.', 'She likes tea.'],
    'Окончание -s нужно в Present Simple для третьего лица единственного числа.',
    'После will и после can окончание -s не нужно.',
    'Cambridge Dictionary',
  ),
];
