-- The skin a jelly chose for a cosmetic, next to its color. Null keeps the plain look.

-- +goose Up
ALTER TABLE player_cosmetics ADD COLUMN skin TEXT;

-- +goose Down
ALTER TABLE player_cosmetics DROP COLUMN skin;
