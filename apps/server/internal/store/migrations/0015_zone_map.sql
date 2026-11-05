-- A zone only says how jellies use it. What stands there comes from the map as a prop, with `blocks`
-- for whether they can walk through. `map_id` finds a zone again when a map is imported again.

-- +goose Up
ALTER TABLE lan_areas ADD COLUMN map_id TEXT;
ALTER TABLE lan_areas ADD COLUMN blocks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lan_areas ADD COLUMN prop TEXT NOT NULL DEFAULT '';
UPDATE lan_areas SET blocks = 1, prop = 'desk' WHERE kind = 'desk';
UPDATE lan_areas SET prop = 'cable' WHERE kind = 'cable';
UPDATE lan_areas SET blocks = 1, prop = 'snack-bar-set' WHERE kind = 'snackbar';
ALTER TABLE lan_areas ADD COLUMN new_kind TEXT NOT NULL DEFAULT 'none'
  CHECK (new_kind IN ('seats', 'stage', 'lounge', 'visitors', 'queue', 'public', 'spectators', 'winner', 'none'));
UPDATE lan_areas SET new_kind = kind WHERE kind NOT IN ('desk', 'cable', 'snackbar');
ALTER TABLE lan_areas DROP COLUMN kind;
ALTER TABLE lan_areas RENAME COLUMN new_kind TO kind;
CREATE UNIQUE INDEX lan_areas_map_id ON lan_areas (lan_id, map_id) WHERE map_id IS NOT NULL;
-- Small props need parts of a percent, and the table is STRICT.
ALTER TABLE lan_areas ADD COLUMN real_x REAL NOT NULL DEFAULT 0;
ALTER TABLE lan_areas ADD COLUMN real_y REAL NOT NULL DEFAULT 0;
ALTER TABLE lan_areas ADD COLUMN real_width REAL NOT NULL DEFAULT 0;
ALTER TABLE lan_areas ADD COLUMN real_height REAL NOT NULL DEFAULT 0;
UPDATE lan_areas SET real_x = x, real_y = y, real_width = width, real_height = height;
ALTER TABLE lan_areas DROP COLUMN x;
ALTER TABLE lan_areas DROP COLUMN y;
ALTER TABLE lan_areas DROP COLUMN width;
ALTER TABLE lan_areas DROP COLUMN height;
ALTER TABLE lan_areas RENAME COLUMN real_x TO x;
ALTER TABLE lan_areas RENAME COLUMN real_y TO y;
ALTER TABLE lan_areas RENAME COLUMN real_width TO width;
ALTER TABLE lan_areas RENAME COLUMN real_height TO height;

-- +goose Down
ALTER TABLE lan_areas ADD COLUMN int_x INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lan_areas ADD COLUMN int_y INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lan_areas ADD COLUMN int_width INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lan_areas ADD COLUMN int_height INTEGER NOT NULL DEFAULT 1;
UPDATE lan_areas SET int_x = CAST(x AS INTEGER), int_y = CAST(y AS INTEGER),
  int_width = MAX(1, CAST(width AS INTEGER)), int_height = MAX(1, CAST(height AS INTEGER));
ALTER TABLE lan_areas DROP COLUMN x;
ALTER TABLE lan_areas DROP COLUMN y;
ALTER TABLE lan_areas DROP COLUMN width;
ALTER TABLE lan_areas DROP COLUMN height;
ALTER TABLE lan_areas RENAME COLUMN int_x TO x;
ALTER TABLE lan_areas RENAME COLUMN int_y TO y;
ALTER TABLE lan_areas RENAME COLUMN int_width TO width;
ALTER TABLE lan_areas RENAME COLUMN int_height TO height;
DROP INDEX lan_areas_map_id;
ALTER TABLE lan_areas ADD COLUMN old_kind TEXT NOT NULL DEFAULT 'none'
  CHECK (old_kind IN ('seats', 'desk', 'cable', 'stage', 'lounge', 'snackbar', 'visitors', 'none'));
UPDATE lan_areas SET old_kind = kind WHERE kind IN ('seats', 'stage', 'lounge', 'visitors');
UPDATE lan_areas SET old_kind = 'desk' WHERE prop = 'desk';
UPDATE lan_areas SET old_kind = 'cable' WHERE prop = 'cable';
UPDATE lan_areas SET old_kind = 'snackbar' WHERE prop = 'snack-bar-set';
ALTER TABLE lan_areas DROP COLUMN kind;
ALTER TABLE lan_areas RENAME COLUMN old_kind TO kind;
ALTER TABLE lan_areas DROP COLUMN prop;
ALTER TABLE lan_areas DROP COLUMN blocks;
ALTER TABLE lan_areas DROP COLUMN map_id;
