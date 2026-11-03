-- Zones get a free name, and two more things they can be assigned to.

-- +goose Up
ALTER TABLE lan_areas ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE lan_areas ADD COLUMN assigned_kind TEXT NOT NULL DEFAULT 'none'
  CHECK (assigned_kind IN ('seats', 'desk', 'cable', 'stage', 'lounge', 'snackbar', 'visitors', 'none'));
UPDATE lan_areas SET assigned_kind = kind;
ALTER TABLE lan_areas DROP COLUMN kind;
ALTER TABLE lan_areas RENAME COLUMN assigned_kind TO kind;

-- +goose Down
ALTER TABLE lan_areas ADD COLUMN old_kind TEXT NOT NULL DEFAULT 'seats'
  CHECK (old_kind IN ('seats', 'desk', 'cable', 'stage', 'lounge', 'snackbar'));
UPDATE lan_areas SET old_kind = kind WHERE kind NOT IN ('visitors', 'none');
ALTER TABLE lan_areas DROP COLUMN kind;
ALTER TABLE lan_areas RENAME COLUMN old_kind TO kind;
ALTER TABLE lan_areas DROP COLUMN name;
