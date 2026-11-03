-- Room-shaped stage areas. A jelly belongs to at most one area per LAN.

-- +goose Up
CREATE TABLE lan_areas (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  lan_id INTEGER NOT NULL REFERENCES lans (id) ON DELETE CASCADE,
  x      INTEGER NOT NULL,
  y      INTEGER NOT NULL,
  width  INTEGER NOT NULL,
  height INTEGER NOT NULL
) STRICT;

CREATE INDEX lan_areas_lan ON lan_areas (lan_id);

ALTER TABLE lan_entries ADD COLUMN area_id INTEGER
  REFERENCES lan_areas (id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE lan_entries DROP COLUMN area_id;
DROP INDEX lan_areas_lan;
DROP TABLE lan_areas;
