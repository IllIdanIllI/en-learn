import type { GeneratedWord } from '@/core/llm/types';

export function gen(over: Partial<GeneratedWord> = {}): GeneratedWord {
  return {
    word: 'supersede', definition: 'd', translation: 't', example: 'e', synonyms: ['replace'],
    gaps: [1, 2, 3].map((i) => ({ sentence: `Gap ${i} ___ here.`, answer: 'superseded', translation: `п${i}` })),
    collocations: [{ phrase: 'a ___ b', answer: 'supersede' }, { phrase: 'c ___ d', answer: 'supersede' }],
    forms: [],
    confusables: [],
    translations: [{ text: 'один', answers: ['one', 'uno'] }, { text: 'два', answers: ['two', 'dos'] }],
    ...over,
  };
}
