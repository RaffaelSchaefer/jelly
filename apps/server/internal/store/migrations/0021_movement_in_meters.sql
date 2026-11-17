-- Walking speed and the distance for "next to each other" were counted in jelly units, of which a
-- jelly is 1.7 wide. Now they are meters, so stored values shrink by the width of a jelly in meters
-- over 1.7. A LAN without its own jelly width has the default of half a meter.
-- +goose Up
UPDATE lans SET rules = json_set(rules,
    '$.walk_speed', ROUND(json_extract(rules, '$.walk_speed') * COALESCE(json_extract(rules, '$.jelly_width'), 0.5) / 1.7, 2),
    '$.near_distance', ROUND(json_extract(rules, '$.near_distance') * COALESCE(json_extract(rules, '$.jelly_width'), 0.5) / 1.7, 2))
WHERE json_extract(rules, '$.walk_speed') IS NOT NULL AND json_extract(rules, '$.near_distance') IS NOT NULL;

-- +goose Down
UPDATE lans SET rules = json_set(rules,
    '$.walk_speed', json_extract(rules, '$.walk_speed') * 1.7 / COALESCE(json_extract(rules, '$.jelly_width'), 0.5),
    '$.near_distance', json_extract(rules, '$.near_distance') * 1.7 / COALESCE(json_extract(rules, '$.jelly_width'), 0.5))
WHERE json_extract(rules, '$.walk_speed') IS NOT NULL AND json_extract(rules, '$.near_distance') IS NOT NULL;
