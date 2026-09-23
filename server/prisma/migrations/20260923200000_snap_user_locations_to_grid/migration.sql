-- Data-only migration: coarsen any stored location to the 0.03° location grid
-- (src/lib/grid.ts), so no exact position predating grid snapping survives.
-- Same maths as snapToGrid: centre of the floor() cell, clamped, 6 decimals.
-- accuracy_m described the exact GPS fix, so it goes too.
UPDATE "user_locations"
SET
  "lat" = round(GREATEST(-90,  LEAST(90,  (floor("lat" / 0.03) + 0.5) * 0.03))::numeric, 6)::double precision,
  "lng" = round(GREATEST(-180, LEAST(180, (floor("lng" / 0.03) + 0.5) * 0.03))::numeric, 6)::double precision,
  "accuracy_m" = NULL;
