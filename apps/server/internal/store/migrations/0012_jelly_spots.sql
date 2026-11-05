-- Where a jelly last stood, so it continues there after a restart of the server.

-- +goose Up
ALTER TABLE lan_entries ADD COLUMN spot_x REAL;
ALTER TABLE lan_entries ADD COLUMN spot_y REAL;

-- +goose Down
ALTER TABLE lan_entries DROP COLUMN spot_y;
ALTER TABLE lan_entries DROP COLUMN spot_x;
