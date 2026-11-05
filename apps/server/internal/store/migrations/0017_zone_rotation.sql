-- A zone can stand at any angle. Its rectangle is given as it would stand without rotation, and it
-- turns around its middle.

-- +goose Up
ALTER TABLE lan_areas ADD COLUMN rotation REAL NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE lan_areas DROP COLUMN rotation;
