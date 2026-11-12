import type { Word } from './types';

/** Ids of ready words that have no transcription yet (the start-up phonetics run). */
export function wordsMissingPhonetics(words: Word[]): number[] {
  return words.filter((w) => w.generation === 'ready' && w.transcription.trim() === '').map((w) => w.id);
}
