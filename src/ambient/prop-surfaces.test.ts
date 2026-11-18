import { describe, expect, it } from "vitest";
import layout from "../room-layout.json" with { type: "json" };
import { recordingContext } from "./recording-context.test-helper";
import { STILL_T } from "./still";
import { ambientSurfaces, createSurfaceDriver, isFilled, RESERVED, type Surface } from "./surfaces";
import { WISP_STILL_POS } from "./iron-wisp";

// The three surfaces on props that don't move in the bake (#381): the oscilloscope, the rack's lights and the soldering iron's wisp.
const IDS = ["oscilloscope", "rack-lights", "iron-wisp"];
const mine = () => ambientSurfaces([]).filter(isFilled).filter((s) => IDS.includes(s.id));
type Prop = { id: string; centre: number[]; yaw: number; tilt?: number; size: number[] };
const props = (layout as { props: Prop[] }).props;

describe("the oscilloscope, rack lights and iron wisp in the list", () => {
  it("are filled, in that order, and nothing else of theirs is left a placeholder", () => {
    expect(mine().map((s) => s.id)).toEqual(IDS);
  });
  it("keep to the canvas reserved for each", () => {
    for (const s of mine()) { expect(s.size.w).toBeLessThanOrEqual(RESERVED[s.id].w); expect(s.size.h).toBeLessThanOrEqual(RESERVED[s.id].h); }
  });
  it("stand where their src/room-layout.json entry puts them: its centre, yaw and size (and tilt, if it has one)", () => {
    for (const s of mine()) {
      const p = props.find((e) => e.id === s.id)!;
      expect(s.plane.position).toEqual(p.centre);
      expect(s.plane.yaw).toBeCloseTo((p.yaw * Math.PI) / 180, 9);
      expect(s.plane.tilt).toBeCloseTo(((p.tilt ?? 0) * Math.PI) / 180, 9);
      expect([s.plane.width, s.plane.height]).toEqual(p.size);
    }
  });
  it("have a canvas whose shape is the plane's, so nothing is stretched", () => {
    for (const s of mine()) expect(s.size.w / s.size.h).toBeCloseTo(s.plane.width / s.plane.height, 0);
  });
});

describe("the stop puts the still frame on the glass", () => {
  // A canvas that has had a mid-cycle frame drawn, then the stop's: the stop's calls must be those of a clean still frame
  // (it covers or clears the whole canvas first) and the surface must be uploaded, not skipped as unchanged.
  const stillCalls = (s: Surface) => { const r = recordingContext(); s.draw(r.ctx, STILL_T); return r.calls; };
  for (const id of IDS) it(`${id}: a tick mid-cycle, then the still frame, uploads it and paints what a still frame paints`, () => {
    const s = mine().find((e) => e.id === id)!;
    const r = recordingContext();
    let uploads = 0;
    const driver = createSurfaceDriver([s], () => ({ ctx: r.ctx, upload: () => { uploads++; } }));
    const mid = STILL_T - WISP_STILL_POS + 900; // inside the wisp's burst; mid-cycle for the others too
    driver.tick(mid);
    expect(uploads).toBe(1);
    r.calls.length = 0;
    driver.still();
    expect(uploads).toBe(2);
    expect(r.calls).toEqual(["save()", ...stillCalls(s), "restore()"]);
    // it starts by covering or clearing the whole canvas
    const first = r.calls[1];
    expect(first).toBe(id === "oscilloscope" ? `fillRect(0,0,${s.size.w},${s.size.h})` : `clearRect(0,0,${s.size.w},${s.size.h})`);
  });
});
