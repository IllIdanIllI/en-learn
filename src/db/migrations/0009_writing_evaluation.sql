-- Writing evaluation: error type per writing error, IELTS-style assessment and strong parts per checked text (spec 2026-11-15). Old rows keep NULL.
ALTER TABLE answer ADD COLUMN error_kind TEXT;
ALTER TABLE writing_text ADD COLUMN assessment TEXT;
ALTER TABLE writing_text ADD COLUMN strengths TEXT;
