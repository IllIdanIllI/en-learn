-- Dictionary check (kaikki.org): Russian translations found for the word, and whether it was checked ('' = not yet).
ALTER TABLE word ADD COLUMN dict_translations TEXT NOT NULL DEFAULT '[]';
ALTER TABLE word ADD COLUMN dict_checked TEXT NOT NULL DEFAULT '';
