import type { ISODate } from '@/core/domain';
import type { WordExercise } from '@/core/words/types';

// Pure data of the `words` preview states, kept apart from fixtures.ts so the e2e spec can import it without the bundled prompts.

export interface PreviewWord {
  word: string;
  translation: string;
  definition: string;
  example: string;
  synonyms: string[];
  added: ISODate;
  /** Days of the counted reviews, all correct: the replay gives the word's stage (the comment on each word). */
  reviews: ISODate[];
  gaps: string[];
  collocations: string[];
  form: { sentence: string; cue: string; answer: string };
  confusable: { sentence: string; options: string[]; reason: string };
  translations: { text: string; answers: string[] }[];
}

/**
 * Seven ready words (stages 4, 3, 3, 2, 1, 1 and one never reviewed); all but the never-reviewed one are due on TUESDAY.
 * With the seeded random of buildPreview the first practice shows confusable, translation, use, gap_hint, confusable, anagram, choice:
 * review dates and order set that sequence, so changing them changes which card types words.spec.ts meets.
 */
export const PREVIEW_WORDS: PreviewWord[] = [
  {
    word: 'resilient', translation: 'устойчивый', definition: 'able to recover quickly after difficulties', example: 'Children are often more resilient than adults expect.',
    synonyms: ['tough', 'hardy'], added: '2025-03-01',
    reviews: ['2025-03-03', '2025-03-07', '2025-03-14', '2025-03-28', '2025-04-23', '2025-06-04'], // Stage 4
    gaps: ['After the storm the town proved remarkably ___ and rebuilt within a year.', 'A ___ economy recovers fast from a crisis.'],
    collocations: ['a ___ community', 'remarkably ___'],
    form: { sentence: 'The team showed great ___ after the defeat.', cue: 'resilient', answer: 'resilience' },
    confusable: { sentence: 'Young trees are ___ to strong wind.', options: ['resilient', 'resistant'], reason: 'Resilient means recovering; resistant means not affected.' },
    translations: [{ text: 'Наша команда очень устойчивая.', answers: ['Our team is very resilient.'] }, { text: 'Дети быстро восстанавливаются.', answers: ['Children are resilient.'] }],
  },
  {
    word: 'meticulous', translation: 'тщательный', definition: 'showing great attention to every detail', example: 'She kept meticulous records of every sale.',
    synonyms: ['careful', 'thorough'], added: '2026-07-20',
    reviews: ['2026-08-01', '2026-08-05', '2026-08-10', '2026-08-16'], // Stage 3
    gaps: ['The editor was ___ and checked every comma twice.', 'His ___ notes helped the whole class.'],
    collocations: ['a ___ attention to detail', 'extremely ___'],
    form: { sentence: 'She checked every detail ___.', cue: 'meticulous', answer: 'meticulously' },
    confusable: { sentence: 'A ___ planner leaves nothing to chance.', options: ['meticulous', 'suspicious'], reason: 'Meticulous describes care; suspicious describes doubt.' },
    translations: [{ text: 'Он очень тщательный человек.', answers: ['He is a very meticulous person.', 'He is very meticulous.'] }, { text: 'Она тщательно планирует поездки.', answers: ['She plans her trips meticulously.'] }],
  },
  {
    word: 'pragmatic', translation: 'практичный', definition: 'dealing with problems in a sensible, realistic way', example: 'We need a pragmatic solution, not a perfect one.',
    synonyms: ['practical', 'realistic'], added: '2026-07-25',
    reviews: ['2026-08-02', '2026-08-07', '2026-08-12', '2026-08-18'], // Stage 3
    gaps: ['She took a ___ approach and fixed the problem step by step.', 'A ___ leader accepts what is possible.'],
    collocations: ['a ___ decision', 'highly ___'],
    form: { sentence: 'He solved the issue ___ rather than emotionally.', cue: 'pragmatic', answer: 'pragmatically' },
    confusable: { sentence: 'The plan is ___ and easy to carry out.', options: ['pragmatic', 'dramatic'], reason: 'Pragmatic means practical; dramatic means striking.' },
    translations: [{ text: 'Нам нужен практичный подход.', answers: ['We need a pragmatic approach.'] }, { text: 'Она практичный человек.', answers: ['She is a pragmatic person.'] }],
  },
  {
    word: 'candid', translation: 'откровенный', definition: 'honest and direct, even when the truth is uncomfortable', example: 'I appreciate your candid opinion.',
    synonyms: ['frank', 'open'], added: '2026-09-20',
    reviews: ['2026-10-01', '2026-10-04'], // Stage 2
    gaps: ['To be ___, I did not enjoy the film.', 'She gave a ___ answer about her mistakes.'],
    collocations: ['a ___ conversation', 'brutally ___'],
    form: { sentence: 'He spoke ___ about his plans.', cue: 'candid', answer: 'candidly' },
    confusable: { sentence: 'Her ___ remarks surprised the audience.', options: ['candid', 'candidate'], reason: 'Candid is an adjective; a candidate applies for a job.' },
    translations: [{ text: 'Он откровенно рассказал о проблемах.', answers: ['He was candid about the problems.', 'He spoke candidly about the problems.'] }, { text: 'Мне нужен откровенный ответ.', answers: ['I need a candid answer.'] }],
  },
  {
    word: 'tenacious', translation: 'упорный', definition: 'holding on firmly and refusing to give up', example: 'A tenacious reporter, she never dropped a story.',
    synonyms: ['persistent', 'determined'], added: '2026-10-12',
    reviews: ['2026-10-16'], // Stage 1
    gaps: ['The ___ climber kept going despite the cold.', 'His ___ efforts finally paid off.'],
    collocations: ['a ___ grip', 'fiercely ___'],
    form: { sentence: 'She held on ___ to her dream.', cue: 'tenacious', answer: 'tenaciously' },
    confusable: { sentence: 'A ___ stain is hard to remove.', options: ['tenacious', 'spacious'], reason: 'Tenacious means holding firm; spacious means roomy.' },
    translations: [{ text: 'Он упорный спортсмен.', answers: ['He is a tenacious athlete.'] }, { text: 'Она упорно идёт к цели.', answers: ['She tenaciously pursues her goal.'] }],
  },
  {
    word: 'ubiquitous', translation: 'вездесущий', definition: 'seeming to be present everywhere at the same time', example: 'Smartphones have become ubiquitous.',
    synonyms: ['omnipresent', 'widespread'], added: '2026-10-10',
    reviews: ['2026-10-14'], // Stage 1
    gaps: ['Coffee shops are ___ in this part of the city.', 'The ___ advertising followed us everywhere.'],
    collocations: ['a ___ presence', 'almost ___'],
    form: { sentence: 'The ___ of cameras worries many people.', cue: 'ubiquitous', answer: 'ubiquity' },
    confusable: { sentence: 'Plastic bags are ___ in every shop.', options: ['ubiquitous', 'ambiguous'], reason: 'Ubiquitous means everywhere; ambiguous means unclear.' },
    translations: [{ text: 'Телефоны есть повсюду.', answers: ['Phones are ubiquitous.'] }, { text: 'Реклама стала вездесущей.', answers: ['Advertising has become ubiquitous.'] }],
  },
  {
    word: 'ephemeral', translation: 'недолговечный', definition: 'lasting for a very short time', example: 'Fame can be ephemeral.',
    synonyms: ['fleeting', 'brief'], added: '2026-10-18',
    reviews: [], // never reviewed (Stage 1)
    gaps: ['The beauty of the sunset was ___ and soon faded.', 'Social media posts are often ___.'],
    collocations: ['an ___ moment', 'strangely ___'],
    form: { sentence: 'We were struck by the ___ of the festival.', cue: 'ephemeral', answer: 'ephemerality' },
    confusable: { sentence: 'Snowflakes are ___ and melt in seconds.', options: ['ephemeral', 'eternal'], reason: 'Ephemeral means short-lived; eternal means forever.' },
    translations: [{ text: 'Слава недолговечна.', answers: ['Fame is ephemeral.'] }, { text: 'Это был мимолётный момент.', answers: ['It was an ephemeral moment.'] }],
  },
];

/** The word whose generation failed: shown with "Повторить", never practised. */
export const FAILED_WORD = 'obscure';

/**
 * What the practice page asks mapped to the right answer, for the e2e helper: the definition (choice, anagram), a gap, collocation,
 * form or confusable sentence, or the Russian text of a translation card.
 */
export const PREVIEW_WORD_ANSWERS: Record<string, string> = Object.fromEntries(
  PREVIEW_WORDS.flatMap((w) => [
    [w.definition, w.word],
    ...w.gaps.map((g) => [g, w.word]),
    ...w.collocations.map((c) => [c, w.word]),
    [w.form.sentence, w.form.answer],
    [w.confusable.sentence, w.word],
    ...w.translations.map((tr) => [tr.text, tr.answers[0] ?? '']),
  ]),
);

const LIMIT_NAMES = [
  'brisk', 'gentle', 'vivid', 'humble', 'sturdy', 'eager', 'swift', 'calm', 'bold', 'frail', 'noble',
  'rustic', 'clever', 'stern', 'lively', 'modest', 'fierce', 'tidy', 'jolly', 'prudent', 'serene',
];

const limitWord = (word: string, i: number, reviewed: boolean): PreviewWord => ({
  word, translation: `перевод ${word}`, definition: `the meaning of ${word} (${i})`, example: `This is an example with ${word}.`,
  synonyms: [`${word}ish`], added: `2026-10-${String(i + 1).padStart(2, '0')}`,
  reviews: reviewed ? ['2026-10-20'] : [],
  gaps: [`A gap sentence number one for ${word} is ___.`, `A gap sentence number two for ${word} is ___.`],
  collocations: [`a ${word} ___`],
  form: { sentence: `A form sentence for ${word} is ___.`, cue: word, answer: `${word}ly` },
  confusable: { sentence: `A confusable sentence for ${word} is ___.`, options: [word, `${word}er`], reason: `${word} is the right one.` },
  translations: [{ text: `Русский текст про ${word}.`, answers: [`English text about ${word}.`] }],
});

/**
 * The `words-limit` state: ten words already started today (one counted review today, next due in the future)
 * and eleven ready never-reviewed words, so today's allowance of ten new words is used up.
 */
export const LIMIT_WORDS: PreviewWord[] = LIMIT_NAMES.map((w, i) => limitWord(w, i, i < 10));

/** Like PREVIEW_WORD_ANSWERS, for the cards of LIMIT_WORDS. */
export const LIMIT_WORD_ANSWERS: Record<string, string> = Object.fromEntries(LIMIT_WORDS.map((w) => [w.definition, w.word]));

export function exercisesOf(w: PreviewWord): Omit<WordExercise, 'id' | 'wordId'>[] {
  const ex = (type: WordExercise['type'], prompt: string, answers: string[], more: Partial<WordExercise> = {}) => ({
    type, prompt, answers, translation: null, cue: null, options: null, note: null, ...more,
  });
  return [
    ...w.gaps.map((g, i) => ex('gap', g, [w.word], { translation: i === 0 ? 'Пример перевода.' : null })),
    ...w.collocations.map((c) => ex('collocation', c, [w.word])),
    ex('form', w.form.sentence, [w.form.answer], { cue: w.form.cue }),
    ex('confusable', w.confusable.sentence, [w.word], { options: w.confusable.options, note: w.confusable.reason }),
    ...w.translations.map((tr) => ex('translation', tr.text, tr.answers)),
  ];
}
