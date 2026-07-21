-- Remove deprecated team column from meetings intelligence
ALTER TABLE meetings_intelligence
DROP COLUMN IF EXISTS team;