-- A jelly wears one cosmetic per slot, and a colorable cosmetic has a color.

-- +goose Up
CREATE TABLE player_cosmetics (
  player_id    INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  slot         TEXT    NOT NULL,
  cosmetic_key TEXT    NOT NULL,
  color        TEXT,
  PRIMARY KEY (player_id, slot)
) STRICT;
INSERT INTO player_cosmetics (player_id, slot, cosmetic_key)
  SELECT id, CASE cosmetic_key WHEN 'pixel-glasses' THEN 'face' ELSE 'head' END, cosmetic_key
  FROM players WHERE cosmetic_key IS NOT NULL;
ALTER TABLE players DROP COLUMN cosmetic_key;

-- +goose Down
ALTER TABLE players ADD COLUMN cosmetic_key TEXT;
UPDATE players SET cosmetic_key = (
  SELECT cosmetic_key FROM player_cosmetics
  WHERE player_id = players.id ORDER BY slot = 'head' DESC LIMIT 1
);
DROP TABLE player_cosmetics;
