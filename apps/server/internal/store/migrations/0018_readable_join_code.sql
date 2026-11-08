-- The LAN code is meant for every participant, so the admin page shows it. Older LANs keep only
-- the hash until their code is replaced.
-- +goose Up
ALTER TABLE lans ADD COLUMN join_code TEXT;

-- +goose Down
ALTER TABLE lans DROP COLUMN join_code;
