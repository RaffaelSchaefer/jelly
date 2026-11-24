-- Jelly-News: a gathering of kind `news` keeps its presenter and what it presents, and a LAN
-- remembers which news of its program already started. SQLite cannot change a CHECK, so the
-- gatherings are copied. No other table points at them.
-- +goose Up
CREATE TABLE gatherings_new (
  lan_id    INTEGER PRIMARY KEY REFERENCES lans (id) ON DELETE CASCADE,
  kind      TEXT NOT NULL CHECK (kind IN ('food', 'ceremony', 'news')),
  winner_id INTEGER REFERENCES players (id) ON DELETE SET NULL,
  starts_at INTEGER NOT NULL,
  ends_at   INTEGER NOT NULL,
  presenter_id INTEGER REFERENCES players (id) ON DELETE SET NULL,
  news      TEXT
) STRICT;
INSERT INTO gatherings_new (lan_id, kind, winner_id, starts_at, ends_at)
  SELECT lan_id, kind, winner_id, starts_at, ends_at FROM gatherings;
DROP TABLE gatherings;
ALTER TABLE gatherings_new RENAME TO gatherings;

ALTER TABLE lans ADD COLUMN news_started_for INTEGER NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE lans DROP COLUMN news_started_for;

CREATE TABLE gatherings_old (
  lan_id    INTEGER PRIMARY KEY REFERENCES lans (id) ON DELETE CASCADE,
  kind      TEXT NOT NULL CHECK (kind IN ('food', 'ceremony')),
  winner_id INTEGER REFERENCES players (id) ON DELETE SET NULL,
  starts_at INTEGER NOT NULL,
  ends_at   INTEGER NOT NULL
) STRICT;
INSERT INTO gatherings_old (lan_id, kind, winner_id, starts_at, ends_at)
  SELECT lan_id, kind, winner_id, starts_at, ends_at FROM gatherings WHERE kind != 'news';
DROP TABLE gatherings;
ALTER TABLE gatherings_old RENAME TO gatherings;
