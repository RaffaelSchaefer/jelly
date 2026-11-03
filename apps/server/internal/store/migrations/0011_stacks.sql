-- Jellies standing on top of each other for a while.

-- +goose Up
CREATE TABLE stacks (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  lan_id  INTEGER NOT NULL REFERENCES lans (id) ON DELETE CASCADE,
  x       REAL    NOT NULL,
  y       REAL    NOT NULL,
  ends_at INTEGER NOT NULL
) STRICT;
CREATE INDEX stacks_running ON stacks (lan_id, ends_at);

-- Each jelly stands on one stack at most. The lowest row ID stands at the bottom.
CREATE TABLE stack_members (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  stack_id  INTEGER NOT NULL REFERENCES stacks (id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL UNIQUE REFERENCES players (id) ON DELETE CASCADE
) STRICT;
CREATE INDEX stack_members_stack ON stack_members (stack_id);

-- +goose Down
DROP INDEX stack_members_stack;
DROP TABLE stack_members;
DROP INDEX stacks_running;
DROP TABLE stacks;
