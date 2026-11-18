import { describe, expect, it } from "vitest";
import { Euler, Vector3 } from "three";
import { phosphorFrame, spares } from "../crts";
import { recordingContext } from "./recording-context.test-helper";
import { STILL_T, SCREEN_H, SCREEN_W } from "./still";
import {
  ambientSurfaces, BUDGET_PX, createSurfaceDriver, isFilled, layoutPlane, pixelsPerTick, planeRotation, RESERVED,
  type Bound, type Drawing, type Entry, type Surface,
} from "./surfaces";

const LATER = ["oscilloscope", "rack-lights", "iron-wisp", "fan", "radio", "desk-phone", "clock", "laptop"];
/** The later surfaces some ticket has filled (#381's three), in list order. */
const FILLED_LATER = ["oscilloscope", "rack-lights", "iron-wisp"];
const plane = { position: [0, 1, 0] as [number, number, number], yaw: 0, tilt: 0, width: 0.1, height: 0.1 };

/** A filled surface that records the times it is drawn at. */
const fake = (id: string, draw: Drawing = () => {}): Surface & { drawn: number[] } => {
  const drawn: number[] = [];
  return { id, size: { w: 8, h: 8 }, plane, draw: (c, t) => { drawn.push(t); return draw(c, t); }, drawn };
};
const placeholder = (id: string): Entry => ({ id, size: RESERVED[id], placeholder: true });

/** A driver over `list` whose canvases are recording contexts and whose uploads are counted per id. */
function drive(list: Entry[]) {
  const uploads: Record<string, number> = {};
  const driver = createSurfaceDriver(list, (s): Bound => {
    uploads[s.id] = 0;
    return { ctx: recordingContext().ctx, upload: () => { uploads[s.id]++; } };
  });
  return { driver, uploads };
}

describe("the list", () => {
  const list = ambientSurfaces([]);
  it("starts with the three spare CRTs' screens, 400×300, planes where phosphorFrame puts them", () => {
    const filled = list.filter(isFilled);
    expect(filled.map((s) => s.id)).toEqual([...spares.map((c) => c.id), ...FILLED_LATER]);
    for (const [k, s] of filled.slice(0, spares.length).entries()) {
      expect(s.size).toEqual({ w: SCREEN_W, h: SCREEN_H });
      const f = phosphorFrame(spares[k]);
      expect(s.plane).toMatchObject({ position: f.position, yaw: f.yaw, tilt: 0, width: 0.46, height: 0.36 });
    }
  });
  it("has one placeholder for each later surface not yet filled, with its id and reserved size, and nothing else", () => {
    const placeholders = list.filter((e) => !isFilled(e));
    expect(placeholders.map((p) => p.id)).toEqual(LATER.filter((id) => !FILLED_LATER.includes(id)));
    expect(Object.keys(RESERVED).sort()).toEqual([...LATER].sort());
    for (const p of placeholders) expect(p.size).toEqual(RESERVED[p.id]);
  });
  it("reserves sizes that are multiples of 8, up from design/335's on-screen size × 1.5, except the ones a ticket raised (#381: the oscilloscope's and the iron wisp's)", () => {
    const px1280: Record<string, [number, number]> = {
      "oscilloscope": [30, 31], "rack-lights": [55, 129], "iron-wisp": [3, 32], "fan": [29, 23],
      "radio": [101, 58], "desk-phone": [103, 67], "clock": [49, 48], "laptop": [90, 71],
    };
    const raised: Record<string, { w: number; h: number }> = { "oscilloscope": { w: 96, h: 72 }, "iron-wisp": { w: 16, h: 48 } };
    for (const [id, [w, h]] of Object.entries(px1280)) {
      if (raised[id]) { expect(RESERVED[id]).toEqual(raised[id]); continue; }
      expect(RESERVED[id]).toEqual({ w: Math.ceil((w * 1.5) / 8) * 8, h: Math.ceil((h * 1.5) / 8) * 8 });
    }
  });
  it("has unique ids", () => {
    const ids = list.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("the budget", () => {
  it("the three screens and the eight reserved sizes paint at most 600k px a tick", () => {
    const reserved = Object.values(RESERVED).reduce((n, s) => n + s.w * s.h, 0);
    expect(3 * SCREEN_W * SCREEN_H + reserved).toBeLessThanOrEqual(BUDGET_PX);
    expect(pixelsPerTick(ambientSurfaces([]))).toBeLessThanOrEqual(BUDGET_PX);
  });
  it("counts a filled surface's canvas, and a surface can't go over its reserved size", () => {
    const list = ambientSurfaces([]);
    // what a surface ticket must keep true when it fills its placeholder
    for (const e of list) if (e.id in RESERVED) {
      expect(e.size.w).toBeLessThanOrEqual(RESERVED[e.id].w);
      expect(e.size.h).toBeLessThanOrEqual(RESERVED[e.id].h);
    }
    expect(pixelsPerTick([fake("a"), fake("b")])).toBe(128);
  });
});

describe("the tick", () => {
  it("draws every filled surface at t, and no placeholder", () => {
    const a = fake("a"), b = fake("b");
    const { driver, uploads } = drive([a, placeholder("fan"), b, placeholder("clock")]);
    driver.tick(500);
    expect(a.drawn).toEqual([500]);
    expect(b.drawn).toEqual([500]);
    expect(Object.keys(uploads).sort()).toEqual(["a", "b"]);
    expect(driver.surfaces.map((s) => s.id)).toEqual(["a", "b"]);
  });
  it("uploads each drawn surface", () => {
    const { driver, uploads } = drive([fake("a"), fake("b")]);
    driver.tick(1); driver.tick(2);
    expect(uploads).toEqual({ a: 2, b: 2 });
  });
  it("doesn't upload a surface that says its frame hasn't changed, and still uploads the others", () => {
    const same = fake("same", () => false), moving = fake("moving");
    const { driver, uploads } = drive([same, moving]);
    driver.tick(1);
    expect(same.drawn).toEqual([1]); // it is asked, and answers
    expect(uploads).toEqual({ same: 0, moving: 1 });
  });
  it("brackets each draw in save and restore, so one surface's state can't leak into the next", () => {
    const rec = recordingContext();
    const driver = createSurfaceDriver([fake("a", (c) => { c.fillStyle = "red"; })], () => ({ ctx: rec.ctx, upload: () => {} }));
    driver.tick(1);
    expect(rec.calls).toEqual(["save()", "restore()"]);
  });
});

describe("the stop", () => {
  it("gives every filled surface its still frame, at STILL_T, and uploads it", () => {
    const a = fake("a"), b = fake("b"), c = fake("c");
    const { driver, uploads } = drive([a, placeholder("laptop"), b, c]);
    driver.tick(777);
    driver.still();
    for (const s of [a, b, c]) expect(s.drawn).toEqual([777, STILL_T]);
    expect(uploads).toEqual({ a: 2, b: 2, c: 2 });
  });
  it("draws no placeholder", () => {
    const a = fake("a");
    const { driver, uploads } = drive([a, placeholder("laptop")]);
    driver.still();
    expect(Object.keys(uploads)).toEqual(["a"]);
  });
  it("draws the real screens' still frame without error", () => {
    const { driver, uploads } = drive(ambientSurfaces([{ sha7: "abc1234", subject: "a commit" }]));
    driver.tick(1000);
    driver.still();
    expect(Object.values(uploads)).toEqual(Array(3 + FILLED_LATER.length).fill(2));
  });
});

describe("layoutPlane", () => {
  const props = [
    { id: "clock", centre: [1.9, 1.45, 0.68], yaw: -90, size: [0.18, 0.18] },
    { id: "laptop", centre: [-0.62, 0.87, -1.53], yaw: 8, tilt: 15, size: [0.27, 0.165] },
  ];
  it("reads a surface's plane from its layout entry by id: centre, yaw, size and tilt, the angles in radians", () => {
    expect(layoutPlane("laptop", props)).toEqual({ position: [-0.62, 0.87, -1.53], yaw: (8 * Math.PI) / 180, tilt: (15 * Math.PI) / 180, width: 0.27, height: 0.165 });
  });
  it("is upright when the entry has no tilt", () => {
    expect(layoutPlane("clock", props)).toMatchObject({ yaw: (-90 * Math.PI) / 180, tilt: 0 });
  });
  it("throws when the entry isn't there, so a surface can't be filled without its place", () => {
    expect(() => layoutPlane("fan", props)).toThrow(/"fan"/);
    expect(() => layoutPlane("fan", [])).toThrow(/"fan"/);
  });
});

describe("planeRotation", () => {
  /** The way a mesh with this rotation faces: its plane's normal, which starts at +z. */
  const normal = (yawDeg: number, tiltDeg: number) => {
    const p = { ...plane, yaw: (yawDeg * Math.PI) / 180, tilt: (tiltDeg * Math.PI) / 180 };
    const [x, y, z, order] = planeRotation(p);
    return new Vector3(0, 0, 1).applyEuler(new Euler(x, y, z, order));
  };
  const expected = (yawDeg: number, tiltDeg: number) => {
    const a = (yawDeg * Math.PI) / 180, t = (tiltDeg * Math.PI) / 180;
    return [Math.sin(a) * Math.cos(t), Math.sin(t), Math.cos(a) * Math.cos(t)];
  };
  it("leaves a plane upright with no tilt, as the CRTs' are: rotation [0, yaw, 0]", () => {
    expect(planeRotation({ ...plane, yaw: 1.2 })).toEqual([-0, 1.2, 0, "YXZ"]);
    expect(normal(90, 0).toArray()).toEqual([expect.closeTo(1, 6), expect.closeTo(0, 6), expect.closeTo(0, 6)]);
  });
  it("raises the face's normal by tilt above level, whatever the yaw", () => {
    for (const [yaw, tilt] of [[0, 15], [8, 15], [40, 75], [-90, 11.31], [90, 90], [180, 30]]) {
      expect(normal(yaw, tilt).toArray()).toEqual(expected(yaw, tilt).map((v) => expect.closeTo(v, 6)));
    }
  });
  it("tilts the laptop's lid back and the phone's keypad up: the normal's height is sin(tilt)", () => {
    expect(normal(8, 15).y).toBeCloseTo(Math.sin((15 * Math.PI) / 180), 6);
    expect(normal(40, 75).y).toBeCloseTo(Math.sin((75 * Math.PI) / 180), 6);
  });
});
