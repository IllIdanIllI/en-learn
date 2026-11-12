import type { Db } from '@/core/ports';
import type { ISODate } from '@/core/domain';
import type {
  CardType,
  Generation,
  ReviewResult,
  Word,
  WordErrorInput,
  WordExercise,
  WordFields,
  WordReview,
} from '@/core/words/types';

export class DuplicateWord extends Error {
  constructor(word: string) {
    super(`word already exists: ${word}`);
    this.name = 'DuplicateWord';
  }
}

interface WordRow {
  id: number;
  word: string;
  definition: string;
  translation: string;
  example: string;
  synonyms: string;
  link: string;
  added: ISODate;
  generation: Generation;
  transcription: string;
  part_of_speech: string;
}

interface ExerciseRow {
  id: number;
  word_id: number;
  type: WordExercise['type'];
  prompt: string;
  translation: string | null;
  cue: string | null;
  options: string | null;
  answers: string;
  note: string | null;
}

interface ReviewRow {
  id: number;
  word_id: number;
  exercise_type: CardType;
  exercise_id: number | null;
  answered_at: string;
  date: ISODate;
  result: ReviewResult;
  counted: number;
  text: string;
}

const toWord = (r: WordRow): Word => ({
  id: r.id,
  word: r.word,
  definition: r.definition,
  translation: r.translation,
  example: r.example,
  synonyms: JSON.parse(r.synonyms) as string[],
  link: r.link,
  added: r.added,
  generation: r.generation,
  transcription: r.transcription,
  partOfSpeech: r.part_of_speech,
});

const toExercise = (r: ExerciseRow): WordExercise => ({
  id: r.id,
  wordId: r.word_id,
  type: r.type,
  prompt: r.prompt,
  translation: r.translation,
  cue: r.cue,
  options: r.options === null ? null : (JSON.parse(r.options) as string[]),
  answers: JSON.parse(r.answers) as string[],
  note: r.note,
});

const toReview = (r: ReviewRow): WordReview => ({
  id: r.id,
  wordId: r.word_id,
  cardType: r.exercise_type,
  exerciseId: r.exercise_id,
  answeredAt: r.answered_at,
  date: r.date,
  result: r.result,
  counted: r.counted === 1,
  text: r.text,
});

/** Throws DuplicateWord when another word (not `exceptId`) has the same spelling, case-insensitively. */
async function assertUnique(db: Db, word: string, exceptId: number): Promise<void> {
  const rows = await db.select('SELECT 1 FROM word WHERE lower(word) = lower(?) AND id != ?', [word, exceptId]);
  if (rows.length > 0) throw new DuplicateWord(word);
}

export async function insertWord(db: Db, f: WordFields, createdAt: string): Promise<number> {
  await assertUnique(db, f.word, -1);
  const { lastInsertId } = await db.execute(
    'INSERT INTO word (word, definition, translation, example, synonyms, link, added, generation, created_at, transcription, part_of_speech) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [f.word, f.definition, f.translation, f.example, JSON.stringify(f.synonyms), f.link, f.added, 'pending', createdAt, f.transcription, f.partOfSpeech],
  );
  return lastInsertId;
}

export async function updateWord(db: Db, id: number, f: WordFields): Promise<void> {
  await assertUnique(db, f.word, id);
  await db.execute(
    'UPDATE word SET word = ?, definition = ?, translation = ?, example = ?, synonyms = ?, link = ?, added = ?, transcription = ?, part_of_speech = ? WHERE id = ?',
    [f.word, f.definition, f.translation, f.example, JSON.stringify(f.synonyms), f.link, f.added, f.transcription, f.partOfSpeech, id],
  );
}

export async function setGeneration(db: Db, id: number, g: Generation): Promise<void> {
  await db.execute('UPDATE word SET generation = ? WHERE id = ?', [g, id]);
}

export async function listWords(db: Db): Promise<Word[]> {
  const rows = await db.select<WordRow>(
    'SELECT id, word, definition, translation, example, synonyms, link, added, generation, transcription, part_of_speech FROM word ORDER BY added, id',
  );
  return rows.map(toWord);
}

export async function deleteWord(db: Db, id: number): Promise<void> {
  await db.execute('DELETE FROM word WHERE id = ?', [id]);
}

/** Replaces the word's exercises. Reviews keep their history: their exercise_id becomes NULL. */
export async function replaceExercises(db: Db, wordId: number, ex: Omit<WordExercise, 'id' | 'wordId'>[]): Promise<void> {
  await db.execute('DELETE FROM word_exercise WHERE word_id = ?', [wordId]);
  for (const e of ex) {
    await db.execute(
      'INSERT INTO word_exercise (word_id, type, prompt, translation, cue, options, answers, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [wordId, e.type, e.prompt, e.translation, e.cue, e.options === null ? null : JSON.stringify(e.options), JSON.stringify(e.answers), e.note],
    );
  }
}

export async function updateExercise(db: Db, ex: WordExercise): Promise<void> {
  await db.execute(
    'UPDATE word_exercise SET type = ?, prompt = ?, translation = ?, cue = ?, options = ?, answers = ?, note = ? WHERE id = ?',
    [ex.type, ex.prompt, ex.translation, ex.cue, ex.options === null ? null : JSON.stringify(ex.options), JSON.stringify(ex.answers), ex.note, ex.id],
  );
}

export async function listExercises(db: Db): Promise<WordExercise[]> {
  const rows = await db.select<ExerciseRow>(
    'SELECT id, word_id, type, prompt, translation, cue, options, answers, note FROM word_exercise ORDER BY id',
  );
  return rows.map(toExercise);
}

export async function insertReview(db: Db, r: Omit<WordReview, 'id'>): Promise<number> {
  const { lastInsertId } = await db.execute(
    'INSERT INTO word_review (word_id, exercise_type, exercise_id, answered_at, date, result, counted, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [r.wordId, r.cardType, r.exerciseId, r.answeredAt, r.date, r.result, r.counted ? 1 : 0, r.text],
  );
  return lastInsertId;
}

export async function listReviews(db: Db): Promise<WordReview[]> {
  const rows = await db.select<ReviewRow>(
    'SELECT id, word_id, exercise_type, exercise_id, answered_at, date, result, counted, text FROM word_review ORDER BY answered_at, id',
  );
  return rows.map(toReview);
}

export async function insertWordErrors(db: Db, reviewId: number, errors: WordErrorInput[]): Promise<void> {
  for (const e of errors) {
    await db.execute(
      'INSERT INTO word_error (review_id, fragment, fix, topic_id, suggested_topic, rule_section, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [reviewId, e.fragment, e.fix, e.topicId, e.suggestedTopic, e.ruleSection, e.explanation],
    );
  }
}

/** Word errors with the date and text of the review they came from (the review's text is the sentence). */
export async function listWordErrors(db: Db): Promise<(WordErrorInput & { id: number; date: ISODate; sentence: string })[]> {
  const rows = await db.select<{
    id: number;
    fragment: string;
    fix: string;
    topic_id: number | null;
    suggested_topic: string | null;
    rule_section: string | null;
    explanation: string;
    date: ISODate;
    sentence: string;
  }>(
    `SELECT e.id AS id, e.fragment AS fragment, e.fix AS fix, e.topic_id AS topic_id, e.suggested_topic AS suggested_topic,
            e.rule_section AS rule_section, e.explanation AS explanation, r.date AS date, r.text AS sentence
     FROM word_error e JOIN word_review r ON r.id = e.review_id ORDER BY e.id`,
  );
  return rows.map((r) => ({
    id: r.id,
    fragment: r.fragment,
    fix: r.fix,
    topicId: r.topic_id,
    suggestedTopic: r.suggested_topic,
    ruleSection: r.rule_section,
    explanation: r.explanation,
    date: r.date,
    sentence: r.sentence,
  }));
}
