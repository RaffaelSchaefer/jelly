-- Trips to a point on the stage, and when a jelly last started to follow someone.

-- +goose Up
ALTER TABLE lan_entries ADD COLUMN trip_x REAL;
ALTER TABLE lan_entries ADD COLUMN trip_y REAL;
ALTER TABLE lan_entries ADD COLUMN trip_until INTEGER;
ALTER TABLE lan_entries ADD COLUMN follow_started_at INTEGER NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE lan_entries DROP COLUMN follow_started_at;
ALTER TABLE lan_entries DROP COLUMN trip_until;
ALTER TABLE lan_entries DROP COLUMN trip_y;
ALTER TABLE lan_entries DROP COLUMN trip_x;
