import { describe, expect, it } from "vitest";
import { cyclePosition } from "./phase";
import { STILL_T } from "./still";

describe("cyclePosition", () => {
  it("is the still position at STILL_T, whatever the cycle's length or still position", () => {
    for (const cycle of [1000, 2500, 5000, 60_000, 13_400, 7919]) {
      for (const still of [0, cycle / 4, cycle / 2, cycle - 1]) {
        expect(cyclePosition(STILL_T, cycle, still)).toBeCloseTo(still, 6);
      }
    }
  });
  it("advances with t and starts over after a whole cycle", () => {
    expect(cyclePosition(STILL_T + 300, 1000, 100)).toBeCloseTo(400, 6);
    expect(cyclePosition(STILL_T + 1000, 1000, 100)).toBeCloseTo(100, 6);
    expect(cyclePosition(STILL_T + 1300, 1000, 100)).toBeCloseTo(400, 6);
  });
  it("stays in 0..cycle for times before STILL_T and for t = 0", () => {
    for (const t of [0, 1, STILL_T - 50_000, STILL_T - 1, STILL_T + 123_456]) {
      const p = cyclePosition(t, 1000, 250);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1000);
    }
  });
});
