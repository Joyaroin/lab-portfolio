export type V3 = [number, number, number];

/** How close the parallax offset must get to a target before it lands on it, in room units: a tenth of a millimetre. */
const NEAR = 1e-4;
/** The same for a target of nothing (a landing at a station): a couple of millimetres, so its long tail
 *  does not keep the room drawing frames. */
const NEAR_NOTHING = 2e-3;

/** One frame of easing the camera's parallax offset toward `target`, by the fraction `k` of the way.
 *  Once the step leaves it within a hair of the target it lands on the target exactly and `resting` is true:
 *  a resting offset is returned unchanged by every later frame, whatever `k`, so extra frames (the ambient
 *  screens ask for them at the overview) can't creep the camera. */
export function easeOffset(offset: V3, target: V3, k: number): { offset: V3; resting: boolean } {
  const next: V3 = [
    offset[0] + (target[0] - offset[0]) * k,
    offset[1] + (target[1] - offset[1]) * k,
    offset[2] + (target[2] - offset[2]) * k,
  ];
  const toNothing = Math.hypot(target[0], target[1], target[2]) < 1e-9;
  const left = Math.hypot(target[0] - next[0], target[1] - next[1], target[2] - next[2]);
  if (left < (toNothing ? NEAR_NOTHING : NEAR)) return { offset: [target[0], target[1], target[2]], resting: true };
  return { offset: next, resting: false };
}
