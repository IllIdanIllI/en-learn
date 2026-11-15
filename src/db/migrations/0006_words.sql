-- Words (vocabulary practice). Plain CREATE TABLE statements; no existing table changes.
-- word_review.exercise_type has no CHECK on purpose: card types may grow without a table rebuild.
CREATE TABLE word (
  id INTEGER PRIMARY KEY,
  word TEXT NOT NULL,
  definition TEXT NOT NULL,
  translation TEXT NOT NULL,
  example TEXT NOT NULL,
  synonyms TEXT NOT NULL DEFAULT '[]',
  link TEXT NOT NULL,
  added TEXT NOT NULL,
  generation TEXT NOT NULL DEFAULT 'pending' CHECK (generation IN ('pending','ready','failed')),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX word_word_ci ON word(lower(word));

CREATE TABLE word_exercise (
  id INTEGER PRIMARY KEY,
  word_id INTEGER NOT NULL REFERENCES word(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('gap','collocation','form','confusable','translation')),
  prompt TEXT NOT NULL,
  translation TEXT,
  cue TEXT,
  options TEXT,
  answers TEXT NOT NULL,
  note TEXT
);

CREATE TABLE word_review (
  id INTEGER PRIMARY KEY,
  word_id INTEGER NOT NULL REFERENCES word(id) ON DELETE CASCADE,
  exercise_type TEXT NOT NULL,
  exercise_id INTEGER REFERENCES word_exercise(id) ON DELETE SET NULL,
  answered_at TEXT NOT NULL,
  date TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('correct','hard','wrong')),
  counted INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE word_error (
  id INTEGER PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES word_review(id) ON DELETE CASCADE,
  fragment TEXT NOT NULL,
  fix TEXT NOT NULL,
  topic_id INTEGER REFERENCES topic(id) ON DELETE RESTRICT,
  suggested_topic TEXT,
  rule_section TEXT,
  explanation TEXT NOT NULL
);
