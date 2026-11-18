import { describe, expect, it } from "vitest";
import {
  barHeights, BAR_LOW, DIAL_FAR, DIAL_REST, dialGlow, drawRadio, RADIO_BARS, RADIO_CYCLE_MS, RADIO_H, RADIO_HUNT_FROM, RADIO_HUNT_MS, RADIO_W,
} from "./radio";
import { recordingContext } from "./recording-context.test-helper";
import { STILL_T } from "./still";

/** The cycle's start is the still frame's (RADIO_STILL_POS 0): `at(ms)` is that many ms into the cycle. */
const at = (ms: number) => STILL_T + ms;
const MID = at(RADIO_HUNT_FROM + RADIO_HUNT_MS / 2);

describe("the radio's dial glow", () => {
  it("is at rest at STILL_T, and for the whole rest either side of the hunt", () => {
    expect(dialGlow(STILL_T)).toBe(DIAL_REST);
    expect(dialGlow(at(RADIO_HUNT_FROM - 1))).toBe(DIAL_REST);
    expect(dialGlow(at(RADIO_HUNT_FROM + RADIO_HUNT_MS))).toBe(DIAL_REST);
    expect(dialGlow(at(RADIO_CYCLE_MS - 1))).toBe(DIAL_REST);
  });
  it("is furthest along the dial half way through the hunt", () => {
    expect(dialGlow(MID)).toBeCloseTo(DIAL_FAR, 9);
  });
  it("is part way a quarter in, out of rest and short of the far end", () => {
    const g = dialGlow(at(RADIO_HUNT_FROM + RADIO_HUNT_MS / 4));
    expect(g).toBeGreaterThan(DIAL_REST + 0.1);
    expect(g).toBeLessThan(DIAL_FAR);
  });
  it("hunts: through the hunt it goes both ways, and stays on the dial", () => {
    let up = 0, down = 0, prev = dialGlow(at(RADIO_HUNT_FROM));
    for (let ms = RADIO_HUNT_FROM + 50; ms < RADIO_HUNT_FROM + RADIO_HUNT_MS; ms += 50) {
      const g = dialGlow(at(ms));
      expect(g).toBeGreaterThanOrEqual(DIAL_REST); expect(g).toBeLessThanOrEqual(DIAL_FAR);
      if (g > prev) up++; else if (g < prev) down++;
      prev = g;
    }
    expect(up).toBeGreaterThan(10); expect(down).toBeGreaterThan(10);
  });
  it("repeats every cycle", () => {
    for (const ms of [0, 1500, 2300, 4000, 6100]) expect(dialGlow(at(ms + 3 * RADIO_CYCLE_MS))).toBeCloseTo(dialGlow(at(ms)), 9);
  });
});

describe("the radio's signal bars", () => {
  it("are all low at STILL_T and through the rest", () => {
    expect(barHeights(STILL_T)).toEqual(Array(RADIO_BARS).fill(BAR_LOW));
    expect(barHeights(at(RADIO_HUNT_FROM - 1))).toEqual(Array(RADIO_BARS).fill(BAR_LOW));
    expect(barHeights(at(RADIO_CYCLE_MS - 1))).toEqual(Array(RADIO_BARS).fill(BAR_LOW));
  });
  it("rise in the hunt, each out of step with the next, and never leave 0 to 1", () => {
    let peak = 0;
    for (let ms = RADIO_HUNT_FROM; ms < RADIO_HUNT_FROM + RADIO_HUNT_MS; ms += 40) {
      const hs = barHeights(at(ms));
      expect(hs).toHaveLength(RADIO_BARS);
      for (const h of hs) { expect(h).toBeGreaterThanOrEqual(BAR_LOW - 1e-9); expect(h).toBeLessThanOrEqual(1 + 1e-9); peak = Math.max(peak, h); }
    }
    expect(peak).toBeGreaterThan(0.9);
    const mid = barHeights(MID);
    expect(new Set(mid.map((h) => h.toFixed(3))).size).toBeGreaterThan(2);
  });
  it("fall again: near the hunt's start and end every bar is lower than the tallest is half way in", () => {
    const peak = Math.max(...barHeights(MID));
    for (const ms of [RADIO_HUNT_FROM + 10, RADIO_HUNT_FROM + RADIO_HUNT_MS - 10]) expect(Math.max(...barHeights(at(ms)))).toBeLessThan(peak - 0.5);
  });
});

describe("the radio's drawing", () => {
  const calls = (t: number) => { const r = recordingContext(); drawRadio(r.ctx, t); return r.calls; };
  it("starts by clearing the whole canvas, so what isn't drawn is transparent and the baked wood shows", () => {
    expect(calls(MID)[0]).toBe(`clearRect(0,0,${RADIO_W},${RADIO_H})`);
  });
  it("draws the glow and bars differently mid-hunt than at rest, and the same at the same time", () => {
    expect(calls(MID)).not.toEqual(calls(STILL_T));
    expect(calls(MID)).toEqual(calls(MID));
  });
  it("is the plane's shape (0.30 × 0.16 m)", () => {
    expect(RADIO_W / RADIO_H).toBeCloseTo(0.3 / 0.16, 2);
  });
});
