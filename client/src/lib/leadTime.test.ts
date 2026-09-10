// Unit tests for the lead-time slider mapping.

import {
  MAX_LEAD,
  MID_LEAD,
  MIN_LEAD,
  minutesToPosition,
  positionToMinutes,
} from "./leadTime";

describe("positionToMinutes", () => {
  it("maps the slider ends to the min and max lead time", () => {
    expect(positionToMinutes(0)).toBe(MIN_LEAD);
    expect(positionToMinutes(1)).toBe(MAX_LEAD);
  });

  it("puts the 15-minute boundary at the slider midpoint", () => {
    expect(positionToMinutes(0.5)).toBe(MID_LEAD);
  });

  it("gives the first 15 minutes the whole left half", () => {
    // A quarter of the way in should be roughly the middle of 1..15.
    expect(positionToMinutes(0.25)).toBe(8);
  });

  it("snaps the right half to 5-minute steps", () => {
    expect(positionToMinutes(0.75)).toBe(40); // 0.75 -> 37.5 -> snaps to 40
    for (const p of [0.6, 0.7, 0.85, 0.95]) {
      expect(positionToMinutes(p) % 5).toBe(0);
    }
  });

  it("clamps out-of-range positions", () => {
    expect(positionToMinutes(-1)).toBe(MIN_LEAD);
    expect(positionToMinutes(2)).toBe(MAX_LEAD);
  });
});

describe("minutesToPosition", () => {
  it("is the inverse of positionToMinutes at the anchors", () => {
    expect(minutesToPosition(MIN_LEAD)).toBe(0);
    expect(minutesToPosition(MID_LEAD)).toBe(0.5);
    expect(minutesToPosition(MAX_LEAD)).toBe(1);
  });

  it("round-trips stored minute values back to the same minutes", () => {
    for (const m of [1, 5, 10, 15, 30, 45, 60]) {
      expect(positionToMinutes(minutesToPosition(m))).toBe(m);
    }
  });

  it("clamps out-of-range minutes", () => {
    expect(minutesToPosition(0)).toBe(0);
    expect(minutesToPosition(999)).toBe(1);
  });
});
