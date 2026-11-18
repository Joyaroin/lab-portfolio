import { describe, expect, it } from "vitest";
import { bladeAngle, drawFan, FAN_CYCLE_MS, FAN_H, FAN_STILL_ANGLE, FAN_W } from "./fan";
import { recordingContext } from "./recording-context.test-helper";
import { STILL_T } from "./still";

const TURN = 2 * Math.PI;

describe("the fan's blade angle", () => {
  it("is the stopped angle at STILL_T", () => {
    expect(bladeAngle(STILL_T)).toBeCloseTo(FAN_STILL_ANGLE, 9);
  });
  it("turns clockwise a quarter, half and three quarters of a turn at those shares of the cycle", () => {
    for (const q of [1, 2, 3]) expect(bladeAngle(STILL_T + (q * FAN_CYCLE_MS) / 4)).toBeCloseTo(FAN_STILL_ANGLE + (q * TURN) / 4, 9);
  });
  it("is back to the stopped angle after each whole turn, forwards or back in time", () => {
    for (const k of [-3, -1, 1, 2, 40]) expect(bladeAngle(STILL_T + k * FAN_CYCLE_MS) % TURN).toBeCloseTo(FAN_STILL_ANGLE, 6);
  });
  it("moves between two frames 83 ms apart (the room's tick), well short of a blade's spacing, so it reads as turning", () => {
    const step = bladeAngle(1083) - bladeAngle(1000);
    expect(step).toBeGreaterThan(0.1);
    expect(step).toBeLessThan(TURN / 4 / 2);
  });
});

describe("the fan's drawing", () => {
  const calls = (t: number) => { const r = recordingContext(); drawFan(r.ctx, t); return r.calls; };
  it("starts by clearing the whole canvas, so the pixels outside the disc are transparent", () => {
    expect(calls(1234)[0]).toBe(`clearRect(0,0,${FAN_W},${FAN_H})`);
  });
  it("draws the blades turned between two times, and the same at the same time", () => {
    expect(calls(1000)).not.toEqual(calls(1200));
    expect(calls(1000)).toEqual(calls(1000));
  });
  it("draws the same blades after a whole turn", () => {
    expect(calls(STILL_T + FAN_CYCLE_MS)).toEqual(calls(STILL_T));
  });
  it("is square, like the plane (0.18 × 0.18 m)", () => {
    expect(FAN_W).toBe(FAN_H);
  });
});
