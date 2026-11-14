import type { WordFields } from './types';

/** The fields a background fill can write while an edit form is open. */
export type FillField = 'transcription' | 'partOfSpeech';

/**
 * The fields an edit saves: an empty transcription or part of speech that the learner did not touch keeps its stored value,
 * since a background fill may have written it after the form opened. A touched field saves as typed, even when empty.
 */
export function keepUntouchedBlanks(fields: WordFields, stored: Pick<WordFields, FillField>, touched: ReadonlySet<FillField>): WordFields {
  const keep = (key: FillField): string => (fields[key] === '' && !touched.has(key) ? stored[key] : fields[key]);
  return { ...fields, transcription: keep('transcription'), partOfSpeech: keep('partOfSpeech') };
}
