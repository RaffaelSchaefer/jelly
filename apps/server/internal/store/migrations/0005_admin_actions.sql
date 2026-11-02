-- What admins did and when. There is one shared secret, so it does not say who did it.

-- +goose Up
CREATE TABLE admin_actions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT    NOT NULL,
  target_id  INTEGER,
  created_at INTEGER NOT NULL
) STRICT;

-- +goose Down
DROP TABLE admin_actions;
