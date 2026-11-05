-- A recovery code brings back an account whose secret is lost, without a LAN or a seat. Each account
-- has at most one, and it is only stored as a hash because it opens the account.

-- +goose Up
CREATE TABLE recovery_codes (
    player_id INTEGER PRIMARY KEY REFERENCES players (id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

-- +goose Down
DROP TABLE recovery_codes;
