-- Initial schema (spec section 4). `meta` is owned by the migrations runner.

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE programme (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL
);

CREATE TABLE topic (
  id INTEGER PRIMARY KEY,
  programme_id INTEGER NOT NULL REFERENCES programme(id) ON DELETE RESTRICT,
  key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('learn','notice')),
  week_no INTEGER,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1))
);

CREATE UNIQUE INDEX topic_week_no_unique ON topic(week_no) WHERE week_no IS NOT NULL;

CREATE TABLE weekday_slot (
  weekday INTEGER PRIMARY KEY CHECK (weekday BETWEEN 1 AND 7),
  slot TEXT NOT NULL CHECK (slot IN ('error_spotting','topic','second_set','speaking','writing','review_rewrite','rest'))
);

CREATE TABLE rule (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER NOT NULL UNIQUE REFERENCES topic(id) ON DELETE RESTRICT,
  current_version INTEGER NOT NULL
);

CREATE TABLE rule_version (
  rule_id INTEGER NOT NULL REFERENCES rule(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  sources TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (rule_id, version)
);

CREATE TABLE session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  is_light INTEGER NOT NULL DEFAULT 0 CHECK (is_light IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('draft','generated','graded')),
  created_at TEXT NOT NULL,
  graded_at TEXT
);

CREATE TABLE session_support (
  session_id INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topic(id) ON DELETE RESTRICT,
  UNIQUE (session_id, topic_id)
);

CREATE TABLE block (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('spelling','review','task','speaking')),
  format TEXT NOT NULL CHECK (format IN ('gap','fix','spot','spelling','question')),
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  format_example TEXT,
  passage TEXT,
  minutes INTEGER NOT NULL
);

CREATE TABLE spelling_word (
  id INTEGER PRIMARY KEY,
  word TEXT NOT NULL UNIQUE,
  hint TEXT,
  mnemonic TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE item (
  id INTEGER PRIMARY KEY,
  block_id INTEGER NOT NULL REFERENCES block(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  expected TEXT NOT NULL,
  paragraph INTEGER,
  topic_id INTEGER REFERENCES topic(id) ON DELETE RESTRICT,
  rule_id INTEGER REFERENCES rule(id) ON DELETE RESTRICT,
  rule_version INTEGER,
  rule_section TEXT,
  spelling_word_id INTEGER REFERENCES spelling_word(id) ON DELETE RESTRICT,
  is_check INTEGER NOT NULL DEFAULT 0 CHECK (is_check IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','dropped','defect')),
  note TEXT
);

CREATE TABLE answer (
  item_id INTEGER PRIMARY KEY REFERENCES item(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  verdict TEXT CHECK (verdict IN ('correct','wrong','rule_gap','skipped')),
  fix TEXT,
  rule_section TEXT,
  explanation TEXT,
  vocabulary_note TEXT,
  is_inattention INTEGER NOT NULL DEFAULT 0 CHECK (is_inattention IN (0,1)),
  dispute_text TEXT,
  dispute_reply TEXT,
  dispute_decision TEXT CHECK (dispute_decision IN ('keep','correct','drop'))
);

CREATE TABLE spot_answer (
  block_id INTEGER NOT NULL REFERENCES block(id) ON DELETE CASCADE,
  paragraph INTEGER NOT NULL,
  text TEXT NOT NULL,
  UNIQUE (block_id, paragraph)
);

-- Unsubmitted answers of an ungraded session, so a reload or a visit to another page keeps them.
-- key = 'i:<itemId>' or 'p:<blockId>:<paragraph>'. Deleted when the session is graded.
CREATE TABLE draft_answer (
  session_id INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (session_id, key)
);

CREATE TABLE extra_finding (
  block_id INTEGER NOT NULL REFERENCES block(id) ON DELETE CASCADE,
  paragraph INTEGER NOT NULL,
  text TEXT NOT NULL,
  explanation TEXT NOT NULL,
  UNIQUE (block_id, paragraph, text)
);

CREATE TABLE session_feedback (
  session_id INTEGER PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE,
  patterns TEXT NOT NULL,
  tomorrow TEXT NOT NULL
);

CREATE TABLE rule_gap (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  rule_id INTEGER NOT NULL REFERENCES rule(id) ON DELETE RESTRICT,
  proposal TEXT NOT NULL,
  explanation TEXT NOT NULL,
  sources TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  UNIQUE (item_id)
);

CREATE TABLE spelling_attempt (
  word_id INTEGER NOT NULL REFERENCES spelling_word(id) ON DELETE RESTRICT,
  session_id INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  correct INTEGER NOT NULL CHECK (correct IN (0,1)),
  UNIQUE (word_id, session_id)
);

CREATE TABLE llm_call (
  id INTEGER PRIMARY KEY,
  session_id INTEGER REFERENCES session(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  model TEXT NOT NULL,
  cost_usd REAL NOT NULL,
  duration_ms INTEGER NOT NULL,
  ok INTEGER NOT NULL CHECK (ok IN (0,1)),
  error TEXT,
  response TEXT,
  created_at TEXT NOT NULL
);
