import type { ISODate } from '@/core/domain';

export type Stage = 1 | 2 | 3 | 4; // 4 = Learned
export type ExerciseType = 'gap' | 'collocation' | 'form' | 'confusable' | 'translation';
export type CardType = 'intro' | 'build' | 'choice' | 'anagram' | 'gap_hint' | 'gap' | 'collocation' | 'form' | 'confusable' | 'translation' | 'use' | 'spell' | 'known';
export type ReviewResult = 'correct' | 'hard' | 'wrong';
export type Generation = 'pending' | 'ready' | 'failed';

export interface WordFields {
  word: string;
  definition: string;
  translation: string;
  example: string;
  synonyms: string[];
  link: string;
  added: ISODate;
  /** IPA between slashes, e.g. /ˈsʌbstəns/; '' when unknown. */
  transcription: string;
  /** English, e.g. noun, verb, phrasal verb; '' when unknown. */
  partOfSpeech: string;
}

/** '' = not checked yet; 'found' = kaikki has the word; 'none' = kaikki has no entry. */
export type DictChecked = '' | 'found' | 'none';

export interface Word extends WordFields {
  id: number;
  generation: Generation;
  /** Russian translations from kaikki.org, in sense order. */
  dict: { translations: string[]; checked: DictChecked };
}

export interface WordExercise {
  id: number;
  wordId: number;
  type: ExerciseType;
  prompt: string;
  translation: string | null;
  cue: string | null;
  options: string[] | null;
  answers: string[];
  note: string | null;
}

export interface WordReview {
  id: number;
  wordId: number;
  cardType: CardType;
  exerciseId: number | null;
  answeredAt: string;
  date: ISODate;
  result: ReviewResult;
  counted: boolean;
  text: string;
}

export interface WordErrorInput {
  fragment: string;
  fix: string;
  topicId: number | null;
  suggestedTopic: string | null;
  ruleSection: string | null;
  explanation: string;
}
