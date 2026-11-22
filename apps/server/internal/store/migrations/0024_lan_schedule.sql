-- The program of a LAN as a JSON list, which the orga replaces as a whole like the rules.
-- +goose Up
ALTER TABLE lans ADD COLUMN schedule TEXT NOT NULL DEFAULT '[]';

-- +goose Down
ALTER TABLE lans DROP COLUMN schedule;
