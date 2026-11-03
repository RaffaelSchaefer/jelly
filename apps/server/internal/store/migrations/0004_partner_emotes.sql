-- Partner emotes: a short-lived spoken code, and the history of who did one with whom.

-- +goose Up
CREATE TABLE partner_offers (
  lan_id     INTEGER NOT NULL REFERENCES lans (id) ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  code       TEXT    NOT NULL,
  emote_key  TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (lan_id, player_id),
  UNIQUE (lan_id, code)
) STRICT;

-- One row per player, so counting different partners needs no OR across two columns.
CREATE TABLE partner_emotes (
  lan_id     INTEGER NOT NULL REFERENCES lans (id) ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  partner_id INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  emote_key  TEXT    NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX partner_emotes_player ON partner_emotes (player_id, lan_id, partner_id);

-- +goose Down
DROP INDEX partner_emotes_player;
DROP TABLE partner_emotes;
DROP TABLE partner_offers;
