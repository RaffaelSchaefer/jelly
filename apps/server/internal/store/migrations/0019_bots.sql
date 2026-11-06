-- Bots are accounts the organizers create to test and to fill the stage. They count as normal
-- players, the flag only lets the admin page find, control and remove them.
-- +goose Up
ALTER TABLE players ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE players DROP COLUMN is_bot;
