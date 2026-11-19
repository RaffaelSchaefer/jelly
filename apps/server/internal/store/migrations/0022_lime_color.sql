-- Jellies can be light green (`lime`). SQLite cannot change a CHECK, so `players` is built anew
-- along the steps of the SQLite docs ("Making Other Kinds Of Table Schema Changes"). Thirteen tables
-- point at players with ON DELETE CASCADE: dropping the old table with foreign keys on would delete
-- their rows. The keys stay off for the rebuild, which only works outside a transaction, and goose
-- runs a file without one on a single connection.
-- +goose NO TRANSACTION
-- +goose Up
PRAGMA foreign_keys = OFF;
BEGIN;
CREATE TABLE players_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash   TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  -- Comparison value, so "Jelly" and "jelly" cannot both be taken.
  name_key     TEXT    NOT NULL UNIQUE,
  color        TEXT    NOT NULL CHECK (color IN ('mint', 'lilac', 'peach', 'lime')),
  hidden_at    INTEGER,
  created_at   INTEGER NOT NULL,
  is_bot       INTEGER NOT NULL DEFAULT 0
) STRICT;
INSERT INTO players_new (id, token_hash, name, name_key, color, hidden_at, created_at, is_bot)
  SELECT id, token_hash, name, name_key, color, hidden_at, created_at, is_bot FROM players;
-- AUTOINCREMENT never hands out the id of a deleted player again: the new table keeps the counter.
DELETE FROM sqlite_sequence WHERE name = 'players_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'players_new', seq FROM sqlite_sequence WHERE name = 'players';
DROP TABLE players;
ALTER TABLE players_new RENAME TO players;
COMMIT;
PRAGMA foreign_keys = ON;

-- +goose Down
PRAGMA foreign_keys = OFF;
BEGIN;
UPDATE players SET color = 'mint' WHERE color = 'lime';
CREATE TABLE players_old (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash   TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  -- Comparison value, so "Jelly" and "jelly" cannot both be taken.
  name_key     TEXT    NOT NULL UNIQUE,
  color        TEXT    NOT NULL CHECK (color IN ('mint', 'lilac', 'peach')),
  hidden_at    INTEGER,
  created_at   INTEGER NOT NULL,
  is_bot       INTEGER NOT NULL DEFAULT 0
) STRICT;
INSERT INTO players_old (id, token_hash, name, name_key, color, hidden_at, created_at, is_bot)
  SELECT id, token_hash, name, name_key, color, hidden_at, created_at, is_bot FROM players;
DELETE FROM sqlite_sequence WHERE name = 'players_old';
INSERT INTO sqlite_sequence (name, seq) SELECT 'players_old', seq FROM sqlite_sequence WHERE name = 'players';
DROP TABLE players;
ALTER TABLE players_old RENAME TO players;
COMMIT;
PRAGMA foreign_keys = ON;
