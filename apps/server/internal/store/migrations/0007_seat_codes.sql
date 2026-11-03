-- A seat is a small area with a one-time registration code. Admins read the code on the map, so it
-- stays readable. `code_player_id` names an existing account that the code brings to this seat.

-- +goose Up
ALTER TABLE lan_areas ADD COLUMN code TEXT;
ALTER TABLE lan_areas ADD COLUMN code_player_id INTEGER REFERENCES players (id) ON DELETE SET NULL;
ALTER TABLE lan_areas ADD COLUMN code_used_at INTEGER;
CREATE UNIQUE INDEX lan_areas_code ON lan_areas (code) WHERE code IS NOT NULL;

-- +goose Down
DROP INDEX lan_areas_code;
ALTER TABLE lan_areas DROP COLUMN code_used_at;
ALTER TABLE lan_areas DROP COLUMN code_player_id;
ALTER TABLE lan_areas DROP COLUMN code;
