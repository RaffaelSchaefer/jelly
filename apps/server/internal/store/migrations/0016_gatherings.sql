-- A gathering sends all jellies of a LAN somewhere for a while, like a food event or a ceremony. It
-- is stored with its end, so it survives a restart. A LAN has at most one.

-- +goose Up
CREATE TABLE gatherings (
  lan_id    INTEGER PRIMARY KEY REFERENCES lans (id) ON DELETE CASCADE,
  kind      TEXT NOT NULL CHECK (kind IN ('food', 'ceremony')),
  winner_id INTEGER REFERENCES players (id) ON DELETE SET NULL,
  starts_at INTEGER NOT NULL,
  ends_at   INTEGER NOT NULL
) STRICT;

-- +goose Down
DROP TABLE gatherings;
