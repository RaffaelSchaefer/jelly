-- Everything for the first test: presence, signs, following, event codes, achievements, awards
-- and the event stream.

-- +goose Up
ALTER TABLE lan_entries ADD COLUMN last_seen_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lan_entries ADD COLUMN session_started_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lan_entries ADD COLUMN sign_key TEXT;
ALTER TABLE lan_entries ADD COLUMN follow_player_id INTEGER
  REFERENCES players (id) ON DELETE SET NULL;

CREATE TABLE event_codes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  lan_id          INTEGER NOT NULL REFERENCES lans (id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  code            TEXT    NOT NULL,
  xp              INTEGER NOT NULL CHECK (xp >= 0),
  valid_from      INTEGER NOT NULL,
  valid_until     INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  UNIQUE (lan_id, code),
  CHECK (valid_from < valid_until)
) STRICT;

ALTER TABLE xp_log ADD COLUMN event_code_id INTEGER
  REFERENCES event_codes (id) ON DELETE CASCADE;

-- A code counts once per player, also for simultaneous requests.
CREATE UNIQUE INDEX xp_log_event_code ON xp_log (player_id, event_code_id)
  WHERE event_code_id IS NOT NULL;

-- `scope_lan_id` is the LAN for per-LAN achievements and 0 for lifetime ones.
CREATE TABLE achievements (
  player_id    INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  key          TEXT    NOT NULL,
  scope_lan_id INTEGER NOT NULL,
  earned_at    INTEGER NOT NULL,
  best_value   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, key, scope_lan_id)
) STRICT;

CREATE TABLE awards (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id    INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  lan_id       INTEGER REFERENCES lans (id) ON DELETE SET NULL,
  title        TEXT    NOT NULL,
  cosmetic_key TEXT,
  given_at     INTEGER NOT NULL
) STRICT;

CREATE INDEX awards_player ON awards (player_id);

-- Payloads hold IDs and keys but no names, so deleting a player leaves no trace.
CREATE TABLE event_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lan_id     INTEGER,
  type       TEXT    NOT NULL,
  scope      TEXT    NOT NULL CHECK (scope IN ('public', 'player')),
  player_id  INTEGER REFERENCES players (id) ON DELETE CASCADE,
  payload    TEXT    NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX event_log_player_type ON event_log (player_id, type, created_at);

-- +goose Down
DROP TABLE event_log;
DROP TABLE awards;
DROP TABLE achievements;
DROP INDEX xp_log_event_code;
ALTER TABLE xp_log DROP COLUMN event_code_id;
DROP TABLE event_codes;
ALTER TABLE lan_entries DROP COLUMN follow_player_id;
ALTER TABLE lan_entries DROP COLUMN sign_key;
ALTER TABLE lan_entries DROP COLUMN session_started_at;
ALTER TABLE lan_entries DROP COLUMN last_seen_at;
