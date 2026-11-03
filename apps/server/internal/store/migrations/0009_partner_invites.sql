-- One jelly asks another for a partner emote, and the other one answers.

-- +goose Up
DROP TABLE partner_offers;
CREATE TABLE partner_invites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lan_id     INTEGER NOT NULL REFERENCES lans (id) ON DELETE CASCADE,
  from_id    INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  to_id      INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  emote_key  TEXT    NOT NULL,
  state      TEXT    NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX partner_invites_open ON partner_invites (lan_id, state, to_id, from_id);

-- +goose Down
DROP INDEX partner_invites_open;
DROP TABLE partner_invites;
CREATE TABLE partner_offers (
  lan_id     INTEGER NOT NULL REFERENCES lans (id) ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  code       TEXT    NOT NULL,
  emote_key  TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (lan_id, player_id),
  UNIQUE (lan_id, code)
) STRICT;
