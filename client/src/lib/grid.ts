// Lat/lng grid snapping — the privacy boundary for user location.
//
// The client snaps every GPS fix to LOCATION_GRID_DEG *on the phone* before
// sending it, so an exact position never leaves the device. The server snaps
// again on receipt (older app builds, or anything that skips the client
// code), so an exact position is never stored either.
//
// This is a copy of server/src/lib/grid.ts. Both copies must produce
// identical cells — they share the test vectors in grid.test.ts. Change one,
// change both.
//
// Why 0.03°: about 3.3 km north–south (and 2.3 km east–west at 47°N). That
// matches the ~3 km grid of the forecast models we use (HRRR), so a smaller
// cell buys no forecast accuracy, and it stays above Google Play's 3 km²
// line for "approximate location" at every latitude up to ~70°. Above that,
// east–west spacing shrinks and cells drop below 3 km².
export const LOCATION_GRID_DEG = 0.03;

export interface GridPoint {
  lat: number;
  lng: number;
}

/** Round away floating-point noise so stored centres are stable. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function clamp(n: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, n));
}

/**
 * Centre of the `stepDeg` grid cell containing (lat, lng).
 *
 * `Math.floor` (toward negative infinity) gives stable, non-overlapping cells
 * in the southern and western hemispheres too. Idempotent: snapping a cell
 * centre returns the same centre, so the server can safely re-snap what a
 * client already snapped.
 */
export function snapToGrid(
  lat: number,
  lng: number,
  stepDeg: number = LOCATION_GRID_DEG,
): GridPoint {
  const centre = (n: number) => (Math.floor(n / stepDeg) + 0.5) * stepDeg;
  return {
    lat: round6(clamp(centre(lat), 90)),
    lng: round6(clamp(centre(lng), 180)),
  };
}

/** Stable string key for the cell containing (lat, lng). */
export function cellKey(lat: number, lng: number, stepDeg: number): string {
  const c = snapToGrid(lat, lng, stepDeg);
  return `${c.lat}_${c.lng}`;
}
