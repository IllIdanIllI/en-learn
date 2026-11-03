-- batch
-- Writing blocks. Rebuilds `block` (SQLite 12-step) to widen the kind and format CHECKs.
-- Foreign keys stay OFF during the rebuild: item, spot_answer and extra_finding reference block(id)
-- with ON DELETE CASCADE, and dropping block with foreign keys on would delete their rows.
PRAGMA foreign_keys=OFF;
BEGIN;

CREATE TABLE block_new (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('spelling','review','task','speaking','writing')),
  format TEXT NOT NULL CHECK (format IN ('gap','fix','spot','spelling','question','essay','rewrite')),
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  format_example TEXT,
  passage TEXT,
  minutes INTEGER NOT NULL,
  round INTEGER NOT NULL DEFAULT 1
);

INSERT INTO block_new SELECT id, session_id, ord, kind, format, title, instruction, format_example, passage, minutes, round FROM block;

DROP TABLE block;
ALTER TABLE block_new RENAME TO block;

CREATE TABLE writing_text (
  block_id INTEGER PRIMARY KEY REFERENCES block(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  words INTEGER NOT NULL,
  source_block_id INTEGER REFERENCES block(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE answer ADD COLUMN suggested_topic TEXT;

COMMIT;
PRAGMA foreign_keys=ON;
