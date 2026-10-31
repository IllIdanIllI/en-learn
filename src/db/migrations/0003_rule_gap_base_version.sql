-- Rule version a gap proposal was written against; NULL for gaps stored before this migration.
ALTER TABLE rule_gap ADD COLUMN base_version INTEGER;
