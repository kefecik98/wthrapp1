// Grid snapping tests. The VECTORS table is duplicated verbatim in
// client/src/lib/grid.test.ts — both copies of the grid code must agree on
// every cell, or the client and server would disagree about where users are.

import { describe, expect, it } from "vitest";
import { cellKey, LOCATION_GRID_DEG, snapToGrid } from "./grid";

// [input lat, input lng, expected centre lat, expected centre lng] at 0.03°.
const VECTORS: [number, number, number, number][] = [
  [47.6062, -122.3321, 47.595, -122.325], // Seattle
  [64.1466, -21.9426, 64.155, -21.945], // Reykjavik
  [-33.8688, 151.2093, -33.855, 151.215], // Sydney (southern/eastern)
  [0.001, -0.001, 0.015, -0.015], // either side of the origin
  [90, 180, 90, 180], // clamped at the poles / antimeridian
];

describe("snapToGrid", () => {
  it.each(VECTORS)("(%f, %f) → (%f, %f)", (lat, lng, eLat, eLng) => {
    expect(snapToGrid(lat, lng)).toEqual({ lat: eLat, lng: eLng });
  });

  it("defaults to the location grid", () => {
    expect(snapToGrid(47.6062, -122.3321)).toEqual(
      snapToGrid(47.6062, -122.3321, LOCATION_GRID_DEG),
    );
  });

  it("is idempotent — re-snapping a centre returns the same centre", () => {
    for (const [lat, lng] of VECTORS) {
      const once = snapToGrid(lat, lng);
      expect(snapToGrid(once.lat, once.lng)).toEqual(once);
    }
  });

  it("never lands further from the input than half a cell", () => {
    const c = snapToGrid(47.6062, -122.3321);
    expect(Math.abs(c.lat - 47.6062)).toBeLessThanOrEqual(LOCATION_GRID_DEG / 2);
    expect(Math.abs(c.lng - -122.3321)).toBeLessThanOrEqual(LOCATION_GRID_DEG / 2);
  });

  it("snaps to a coarser forecast cell", () => {
    expect(snapToGrid(40.71, -74.01, 0.1)).toEqual({ lat: 40.75, lng: -74.05 });
  });
});

describe("cellKey", () => {
  it("groups nearby points and separates distant ones", () => {
    expect(cellKey(40.71, -74.01, 0.1)).toBe(cellKey(40.79, -74.09, 0.1));
    expect(cellKey(40.71, -74.01, 0.1)).not.toBe(cellKey(41.5, -75.0, 0.1));
  });
});
