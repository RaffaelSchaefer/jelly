-- What an area is: where jellies stand (seats, stage, lounge), what they walk around (desks, the
-- snack bar) and what they walk over (cables).

-- +goose Up
ALTER TABLE lan_areas ADD COLUMN kind TEXT NOT NULL DEFAULT 'seats'
  CHECK (kind IN ('seats', 'desk', 'cable', 'stage', 'lounge', 'snackbar'));

-- +goose Down
ALTER TABLE lan_areas DROP COLUMN kind;
