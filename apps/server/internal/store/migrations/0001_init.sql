-- Base schema: accounts, LANs, participation and XP history.
-- All times are UTC in Unix milliseconds.

-- +goose Up
CREATE TABLE players (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash   TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  -- Comparison value, so "Jelly" and "jelly" cannot both be taken.
  name_key     TEXT    NOT NULL UNIQUE,
  color        TEXT    NOT NULL CHECK (color IN ('mint', 'lilac', 'peach')),
  cosmetic_key TEXT,
  hidden_at    INTEGER,
  created_at   INTEGER NOT NULL
) STRICT;

CREATE TABLE lans (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT    NOT NULL UNIQUE,
  name           TEXT    NOT NULL,
  starts_at      INTEGER NOT NULL,
  ends_at        INTEGER NOT NULL,
  timezone       TEXT    NOT NULL,
  join_code_hash TEXT    NOT NULL,
  rules          TEXT    NOT NULL,
  CHECK (starts_at < ends_at)
) STRICT;

-- One row is also the badge for this LAN. `xp` is written together with `xp_log`.
CREATE TABLE lan_entries (
  lan_id    INTEGER NOT NULL REFERENCES lans (id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  xp        INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  PRIMARY KEY (lan_id, player_id)
) STRICT;

CREATE INDEX lan_entries_player ON lan_entries (player_id);

CREATE TABLE xp_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lan_id     INTEGER NOT NULL,
  player_id  INTEGER NOT NULL,
  action     TEXT    NOT NULL,
  xp         INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (lan_id, player_id) REFERENCES lan_entries (lan_id, player_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX xp_log_lookup ON xp_log (player_id, lan_id, action, created_at);

-- +goose Down
DROP TABLE xp_log;
DROP TABLE lan_entries;
DROP TABLE lans;
DROP TABLE players;
