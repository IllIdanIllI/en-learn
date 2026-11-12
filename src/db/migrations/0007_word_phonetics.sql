-- Word transcription (IPA) and part of speech. Existing rows read '' until the start-up phonetics run fills them.
ALTER TABLE word ADD COLUMN transcription TEXT NOT NULL DEFAULT '';
ALTER TABLE word ADD COLUMN part_of_speech TEXT NOT NULL DEFAULT '';
