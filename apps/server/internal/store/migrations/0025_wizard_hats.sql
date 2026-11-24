-- The hat of the wizard in the shop, which one jelly of a LAN can steal and wear until `ends_at`. A
-- LAN has at most one. A row whose time is over counts as free.

-- +goose Up
CREATE TABLE wizard_hats (
  lan_id    INTEGER PRIMARY KEY REFERENCES lans (id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  ends_at   INTEGER NOT NULL
) STRICT;

-- +goose Down
DROP TABLE wizard_hats;
