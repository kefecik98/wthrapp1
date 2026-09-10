// Lead-time slider mapping.
//
// The alert lead time (how far ahead of the weather we push) ranges from 1 to
// 60 minutes. A plain linear slider spends most of its travel on values users
// rarely pick. Instead we give the low end more room: the left HALF of the
// slider covers 1–15 min (fine, 1-min steps) and the right HALF covers 15–60
// min (coarser, 5-min steps). This "expands" the small values people care
// about most while still reaching an hour.
//
// The slider widget itself stays a plain 0..1 track; these two pure functions
// convert between the slider position and the stored minute value, so the
// mapping is easy to unit-test in isolation.

export const MIN_LEAD = 1;
export const MID_LEAD = 15; // boundary that sits at the slider's midpoint
export const MAX_LEAD = 60;
const MID_POS = 0.5;

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

/** Slider position (0..1) -> lead time in whole minutes. */
export function positionToMinutes(pos: number): number {
  const p = clamp(pos, 0, 1);
  let minutes: number;
  if (p <= MID_POS) {
    // Left half: 1..15, snapped to 1-minute steps.
    minutes = MIN_LEAD + (p / MID_POS) * (MID_LEAD - MIN_LEAD);
    minutes = Math.round(minutes);
  } else {
    // Right half: 15..60, snapped to 5-minute steps.
    minutes = MID_LEAD + ((p - MID_POS) / MID_POS) * (MAX_LEAD - MID_LEAD);
    minutes = Math.round(minutes / 5) * 5;
  }
  return clamp(minutes, MIN_LEAD, MAX_LEAD);
}

/** Lead time in minutes -> slider position (0..1). Inverse of the above. */
export function minutesToPosition(minutes: number): number {
  const m = clamp(minutes, MIN_LEAD, MAX_LEAD);
  const pos =
    m <= MID_LEAD
      ? ((m - MIN_LEAD) / (MID_LEAD - MIN_LEAD)) * MID_POS
      : MID_POS + ((m - MID_LEAD) / (MAX_LEAD - MID_LEAD)) * MID_POS;
  return clamp(pos, 0, 1);
}
