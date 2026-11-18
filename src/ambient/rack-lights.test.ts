import { describe, expect, it } from "vitest";
import { drawRackLights, lightOn, RACK_CYCLE_MS, RACK_H, RACK_LIGHTS, RACK_STILL_POS, RACK_W, rackLights, SLOT_MS, SLOTS, STEADY_SLOT } from "./rack-lights";
import { recordingContext } from "./recording-context.test-helper";
import { STILL_T } from "./still";

/** The cycle's slot `s` as a `t`, in the middle of the slot. */
const slotT = (s: number) => STILL_T - RACK_STILL_POS + s * SLOT_MS + SLOT_MS / 2;
const states = (t: number) => rackLights(t).map((l) => l.on);

describe("rackLights", () => {
  it("has five lights, each with a place on the strip (0..1) and a colour", () => {
    expect(rackLights(0)).toHaveLength(5);
    for (const l of RACK_LIGHTS) { expect(l.x).toBeGreaterThanOrEqual(0); expect(l.x).toBeLessThanOrEqual(1); expect(l.y).toBeGreaterThanOrEqual(0); expect(l.y).toBeLessThanOrEqual(1); }
  });
  it("has every light on and steady at STILL_T, and for the whole of the steady slot", () => {
    expect(states(STILL_T)).toEqual([true, true, true, true, true]);
    expect(states(slotT(STEADY_SLOT) - SLOT_MS / 2 + 1)).toEqual([true, true, true, true, true]);
    expect(states(slotT(STEADY_SLOT) + SLOT_MS / 2 - 1)).toEqual([true, true, true, true, true]);
  });
  it("is not steady in most other slots: some light is off in at least a third of them", () => {
    const some = Array.from({ length: SLOTS }, (_, s) => s).filter((s) => states(slotT(s)).includes(false));
    expect(some.length).toBeGreaterThan(SLOTS / 3);
  });
  it("blinks each light irregularly: on and off, with runs of more than one length, and the lights not in step", () => {
    for (let i = 0; i < RACK_LIGHTS.length; i++) {
      const row = Array.from({ length: SLOTS }, (_, s) => lightOn(i, s));
      expect(row.includes(true) && row.includes(false), `light ${i}`).toBe(true);
    }
    const disk = Array.from({ length: SLOTS }, (_, s) => lightOn(1, s));
    const runs: number[] = [];
    disk.reduce((n, v, k) => { if (k && v !== disk[k - 1]) { runs.push(n); return 1; } return n + 1; }, 1);
    expect(new Set(runs).size).toBeGreaterThanOrEqual(3);
    const other = Array.from({ length: SLOTS }, (_, s) => lightOn(3, s));
    expect(other).not.toEqual(disk);
  });
  it("does not repeat inside the cycle: no shorter whole number of slots gives the same pattern", () => {
    for (let shift = 1; shift < SLOTS; shift++) {
      const same = Array.from({ length: SLOTS }, (_, s) => RACK_LIGHTS.every((_, i) => lightOn(i, s) === lightOn(i, (s + shift) % SLOTS))).every(Boolean);
      expect(same, `shift ${shift}`).toBe(false);
    }
  });
  it("is the same a whole cycle later, and the same all through a slot", () => {
    for (const t of [0, 1234, 55_555]) expect(states(t + RACK_CYCLE_MS)).toEqual(states(t));
    expect(states(slotT(7) - 40)).toEqual(states(slotT(7) + 40));
  });
});

describe("drawRackLights", () => {
  it("clears the strip first so it is transparent between the lights, and draws a disc on each light", () => {
    const { ctx, calls } = recordingContext();
    drawRackLights(ctx, STILL_T);
    expect(calls[0]).toBe(`clearRect(0,0,${RACK_W},${RACK_H})`);
    expect(calls.filter((c) => c.startsWith("fillRect")).length).toBe(5); // all lit: one glow each
    expect(calls.filter((c) => c.startsWith("arc")).length).toBe(0);
  });
  it("draws a dark disc over a light that is off", () => {
    const { ctx, calls } = recordingContext();
    const off = Array.from({ length: SLOTS }, (_, s) => s).find((s) => states(slotT(s)).filter((v) => !v).length === 1)!;
    drawRackLights(ctx, slotT(off));
    expect(calls.filter((c) => c.startsWith("arc")).length).toBe(1);
    expect(calls.filter((c) => c.startsWith("fillRect")).length).toBe(4);
  });
  it("returns nothing but a drawn canvas (never false): the still frame is always uploaded", () => {
    expect(drawRackLights(recordingContext().ctx, STILL_T)).not.toBe(false);
  });
});
