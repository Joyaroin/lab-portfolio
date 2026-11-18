import { describe, expect, it } from "vitest";
import layout from "../room-layout.json" with { type: "json" };
import { ambientSurfaces, CLOCK_HANDS_M, isFilled, PHONE_NUDGE_M, pixelsPerTick, BUDGET_PX, RESERVED } from "./surfaces";

// The desk phone's display and the wall clock's hands in the list (#383).
const IDS = ["desk-phone", "clock"];
const mine = () => ambientSurfaces([]).filter(isFilled).filter((s) => IDS.includes(s.id));
type Prop = { id: string; centre: number[]; yaw: number; tilt?: number; size: number[] };
const props = (layout as { props: Prop[] }).props;

describe("the desk phone and the clock in the list", () => {
  it("are filled, in that order", () => {
    expect(mine().map((s) => s.id)).toEqual(IDS);
  });
  it("keep to the canvas reserved for each, and the budget still holds", () => {
    for (const s of mine()) { expect(s.size.w).toBeLessThanOrEqual(RESERVED[s.id].w); expect(s.size.h).toBeLessThanOrEqual(RESERVED[s.id].h); }
    expect(pixelsPerTick(ambientSurfaces([]))).toBeLessThanOrEqual(BUDGET_PX);
  });
  it("have a canvas whose shape is the plane's, so nothing is stretched", () => {
    for (const s of mine()) expect(s.size.w / s.size.h).toBeCloseTo(s.plane.width / s.plane.height, 1);
  });
  it("stand at their room-layout.json entry's yaw, tilt and size", () => {
    for (const s of mine()) {
      const p = props.find((e) => e.id === s.id)!;
      expect(s.plane.yaw).toBeCloseTo((p.yaw * Math.PI) / 180, 9);
      expect(s.plane.tilt).toBeCloseTo(((p.tilt ?? 0) * Math.PI) / 180, 9);
      expect([s.plane.width, s.plane.height]).toEqual(p.size);
    }
  });
  it("the desk phone's plane is its entry's centre moved 2 mm out along the face's normal, off the baked display", () => {
    const s = mine()[0], p = props.find((e) => e.id === "desk-phone")!;
    const d = Math.hypot(...s.plane.position.map((v, i) => v - p.centre[i]));
    expect(d).toBeCloseTo(PHONE_NUDGE_M, 9);
    const yaw = (p.yaw * Math.PI) / 180, tilt = ((p.tilt ?? 0) * Math.PI) / 180;
    expect(s.plane.position[1] - p.centre[1]).toBeCloseTo(Math.sin(tilt) * PHONE_NUDGE_M, 9);
    expect(s.plane.position[0] - p.centre[0]).toBeCloseTo(Math.sin(yaw) * Math.cos(tilt) * PHONE_NUDGE_M, 9);
  });
  it("the clock's hands stand 3 mm or more in front of the baked ticks (toward the camera, -x), whose nearest is at x 1.8615", () => {
    const s = mine()[1], p = props.find((e) => e.id === "clock")!;
    expect(p.centre[0]).toBeCloseTo(1.864, 9);
    expect(s.plane.position[0]).toBeCloseTo(p.centre[0] - CLOCK_HANDS_M, 9);
    expect(s.plane.position[1]).toBe(p.centre[1]);
    expect(s.plane.position[2]).toBe(p.centre[2]);
    const NEAREST_TICK_X = 1.8615;
    expect(NEAREST_TICK_X - s.plane.position[0]).toBeGreaterThanOrEqual(0.003 - 1e-9);
  });
});
