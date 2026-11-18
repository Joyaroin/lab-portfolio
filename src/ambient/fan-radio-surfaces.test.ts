import { describe, expect, it } from "vitest";
import layout from "../room-layout.json" with { type: "json" };
import { FAN_CYCLE_MS, FAN_FRONT_M } from "./fan";
import { inFront } from "./front";
import { RADIO_FRONT_M } from "./radio";
import { recordingContext } from "./recording-context.test-helper";
import { STILL_T } from "./still";
import { ambientSurfaces, createSurfaceDriver, isFilled, RESERVED, type Surface } from "./surfaces";

// The fan and the radio in the room's list (#382): filled, on their planes, within their reserved canvases, and the stop puts their still frame on the glass.
const IDS = ["fan", "radio"];
const mine = () => ambientSurfaces([]).filter(isFilled).filter((s) => IDS.includes(s.id));
type Prop = { id: string; centre: number[]; yaw: number; tilt?: number; size: number[] };
const props = (layout as { props: Prop[] }).props;
const entry = (id: string) => props.find((e) => e.id === id)!;
const FRONT: Record<string, number> = { fan: FAN_FRONT_M, radio: RADIO_FRONT_M };

describe("the fan and the radio in the list", () => {
  it("are filled, in that order", () => {
    expect(mine().map((s) => s.id)).toEqual(IDS);
  });
  it("keep to the canvas reserved for each", () => {
    for (const s of mine()) { expect(s.size.w).toBeLessThanOrEqual(RESERVED[s.id].w); expect(s.size.h).toBeLessThanOrEqual(RESERVED[s.id].h); }
  });
  it("have a canvas whose shape is the plane's, so nothing is stretched", () => {
    for (const s of mine()) expect(s.size.w / s.size.h).toBeCloseTo(s.plane.width / s.plane.height, 1);
  });
  it("take their size and angles from their src/room-layout.json entry, and stand in front of its centre, by the amount their module says", () => {
    for (const s of mine()) {
      const p = entry(s.id);
      expect(s.plane.yaw).toBeCloseTo((p.yaw * Math.PI) / 180, 9);
      expect(s.plane.tilt).toBeCloseTo(((p.tilt ?? 0) * Math.PI) / 180, 9);
      expect([s.plane.width, s.plane.height]).toEqual(p.size);
      const d = Math.hypot(...s.plane.position.map((v, k) => v - p.centre[k]));
      expect(d).toBeCloseTo(FRONT[s.id], 9);
    }
  });
  it("put the fan's blades 3.5 cm in front of the axle (+z), and the radio's dial 1.2 cm in front of its face (−x)", () => {
    const [fan, radio] = mine();
    expect(fan.plane.position[2] - entry("fan").centre[2]).toBeCloseTo(0.035, 9);
    expect(fan.plane.position[0]).toBeCloseTo(entry("fan").centre[0], 9);
    expect(radio.plane.position[0] - entry("radio").centre[0]).toBeCloseTo(-0.012, 9);
    expect(radio.plane.position[2]).toBeCloseTo(entry("radio").centre[2], 9);
  });
  it("keep the fan's plane inside 0.03 to 0.04 m in front of the axle, and the radio's in front of the baked dial (x 1.55)", () => {
    expect(FAN_FRONT_M).toBeGreaterThanOrEqual(0.03); expect(FAN_FRONT_M).toBeLessThanOrEqual(0.04);
    expect(mine()[1].plane.position[0]).toBeLessThan(1.55);
  });
});

describe("inFront", () => {
  const plane = { position: [1, 2, 3] as [number, number, number], yaw: 0, tilt: 0, width: 1, height: 1 };
  it("moves a plane along the way it faces, whatever its yaw and tilt", () => {
    expect(inFront(plane, 0.5).position).toEqual([1, 2, 3.5]);
    const east = inFront({ ...plane, yaw: Math.PI / 2 }, 0.5).position;
    expect(east[0]).toBeCloseTo(1.5, 9); expect(east[2]).toBeCloseTo(3, 9);
    const up = inFront({ ...plane, tilt: Math.PI / 2 }, 0.5).position;
    expect(up[1]).toBeCloseTo(2.5, 9); expect(up[2]).toBeCloseTo(3, 9);
  });
});

describe("the stop puts the still frame on the glass", () => {
  // A tick mid-cycle paints a frame; the stop must then paint the still frame and upload it, not skip it as unchanged:
  // `createSurfaceDriver` skips the upload whenever draw returns false.
  const stillCalls = (s: Surface) => { const r = recordingContext(); s.draw(r.ctx, STILL_T); return r.calls; };
  const midCycle: Record<string, number> = { fan: STILL_T + FAN_CYCLE_MS / 3, radio: STILL_T + 4000 };
  for (const id of IDS) it(`${id}: a tick mid-cycle, then the still frame, uploads both and the second paints what a still frame paints`, () => {
    const s = mine().find((e) => e.id === id)!;
    const r = recordingContext();
    let uploads = 0;
    const driver = createSurfaceDriver([s], () => ({ ctx: r.ctx, upload: () => { uploads++; } }));
    driver.tick(midCycle[id]);
    expect(uploads).toBe(1);
    const mid = [...r.calls];
    expect(mid).not.toEqual(["save()", ...stillCalls(s), "restore()"]); // the mid-cycle frame differs from the still frame
    r.calls.length = 0;
    driver.still();
    expect(uploads).toBe(2);
    expect(r.calls).toEqual(["save()", ...stillCalls(s), "restore()"]);
    expect(r.calls[1]).toBe(`clearRect(0,0,${s.size.w},${s.size.h})`); // it clears the whole canvas first: no mid-cycle pixels survive
  });
});
