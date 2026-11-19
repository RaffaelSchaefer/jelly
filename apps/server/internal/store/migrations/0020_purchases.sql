-- The shop: coins per level-up and bought cosmetics.

-- +goose Up
ALTER TABLE lan_entries ADD COLUMN coins INTEGER NOT NULL DEFAULT 0;

-- Every change of the balance, positive or negative, in the same transaction as the action.
CREATE TABLE coin_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lan_id     INTEGER NOT NULL REFERENCES lans (id) ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  source     TEXT    NOT NULL,
  amount     INTEGER NOT NULL CHECK (amount != 0),
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX coin_entries_player ON coin_entries (player_id, lan_id);

-- A permanent purchase has no LAN and stays over every LAN, a purchase of a LAN cosmetic
-- belongs to that LAN. The two unique indexes keep both kinds single.
CREATE TABLE purchases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id    INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  lan_id       INTEGER REFERENCES lans (id) ON DELETE SET NULL,
  cosmetic_key TEXT    NOT NULL,
  price        INTEGER NOT NULL CHECK (price >= 0),
  created_at   INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX purchases_permanent ON purchases (player_id, cosmetic_key)
  WHERE lan_id IS NULL;
CREATE UNIQUE INDEX purchases_lan ON purchases (player_id, lan_id, cosmetic_key)
  WHERE lan_id IS NOT NULL;
CREATE INDEX purchases_player ON purchases (player_id);

-- +goose Down
DROP INDEX purchases_player;
DROP INDEX purchases_lan;
DROP INDEX purchases_permanent;
DROP TABLE purchases;
DROP INDEX coin_entries_player;
DROP TABLE coin_entries;
ALTER TABLE lan_entries DROP COLUMN coins;
