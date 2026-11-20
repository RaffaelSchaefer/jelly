-- Jellies can take the colors of colorable cosmetics too: `sky`, `violet`, `rose`, `cherry`,
-- `tangerine`, `lemon` and `clover`. SQLite cannot change a CHECK, so `players` is built anew like in
-- 0022_lime_color.sql, with foreign keys off and outside a transaction for the same reasons.
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
  color        TEXT    NOT NULL CHECK (color IN (
                 'mint', 'sky', 'violet', 'lilac', 'rose', 'cherry',
                 'peach', 'tangerine', 'lemon', 'lime', 'clover'
               )),
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
-- Each new color falls back to its nearest old one.
UPDATE players SET color = CASE color
    WHEN 'sky' THEN 'mint'
    WHEN 'violet' THEN 'lilac'
    WHEN 'rose' THEN 'lilac'
    WHEN 'cherry' THEN 'peach'
    WHEN 'tangerine' THEN 'peach'
    WHEN 'lemon' THEN 'lime'
    WHEN 'clover' THEN 'lime'
    ELSE color
  END;
CREATE TABLE players_old (
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
INSERT INTO players_old (id, token_hash, name, name_key, color, hidden_at, created_at, is_bot)
  SELECT id, token_hash, name, name_key, color, hidden_at, created_at, is_bot FROM players;
DELETE FROM sqlite_sequence WHERE name = 'players_old';
INSERT INTO sqlite_sequence (name, seq) SELECT 'players_old', seq FROM sqlite_sequence WHERE name = 'players';
DROP TABLE players;
ALTER TABLE players_old RENAME TO players;
COMMIT;
PRAGMA foreign_keys = ON;
