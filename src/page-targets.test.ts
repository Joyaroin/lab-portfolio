import { describe, it, expect } from "vitest";
import { Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Vector3 } from "three";
import { BEZEL, BEZEL_GAP, SCREEN_LAYER } from "./draw";
import { crts, DESK_METER, props, type Prop } from "./crts";
import { BUTTON_PX, startBox } from "./pin";
import { pageTargetGoes, pageTargets, pageTargetsOn, PAGE_TARGETS, targetFrame } from "./page-targets";
import { overviewPose, pinAt, pinPlaces, reach } from "./pins";
import { STATION_COUNT } from "./hold";
import { stations } from "./content";
import { stepAt, walk } from "./walk";
import type { Pose } from "./visit/flight";
import type { Where } from "./where";

// #386: the rack and the desk phone are page shortcuts at the landscape overview. Everything here is pure: the gate, the rule for when a press goes
// where, and a sweep of the overview (no browser, the camera's own projection as src/pins.ts and src/visit/room-props.test.ts do) that keeps each
// target big enough and clear of every other target in the room, the Start button's box and the pins.

type Win = { width: number; height: number };
type Box = { name: string; left: number; top: number; width: number; height: number };

describe("the gate: the rack and the desk phone are targets from 1280 x 720 up, in landscape", () => {
  it("is off at 1279 x 720 and at 1280 x 719, on at 1280 x 720", () => {
    expect(pageTargetsOn({ width: 1279, height: 720 })).toBe(false);
    expect(pageTargetsOn({ width: 1280, height: 719 })).toBe(false);
    expect(pageTargetsOn({ width: 1280, height: 720 })).toBe(true);
  });
  it("is on above it, in 16:9, 16:10, 4:3 and 21:9 windows", () => {
    for (const w of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1280, height: 960 }, { width: 2560, height: 1080 }, { width: 3840, height: 2160 }]) expect(pageTargetsOn(w)).toBe(true);
  });
  it("is off on a portrait window, however big", () => {
    for (const w of [{ width: 390, height: 844 }, { width: 720, height: 1280 }, { width: 1280, height: 1281 }, { width: 2160, height: 3840 }]) expect(pageTargetsOn(w)).toBe(false);
  });
  it("is off on a short landscape window, such as a phone held sideways, and a wide one that is short", () => {
    for (const w of [{ width: 844, height: 390 }, { width: 667, height: 375 }, { width: 1279, height: 1000 }, { width: 3840, height: 700 }]) expect(pageTargetsOn(w)).toBe(false);
  });
});

const BIG = { width: 1440, height: 900 }, SMALL = { width: 1279, height: 720 }, PORTRAIT = { width: 390, height: 844 };
const overview: Where = { kind: "at", stop: 0 };

describe("when a press on the rack or the desk phone visits a page", () => {
  it("does at the overview with nothing moving, inside the gate", () => {
    expect(pageTargetGoes(BIG, overview, 0)).toBe(true);
    expect(pageTargetGoes({ width: 1280, height: 720 }, overview, 0)).toBe(true);
  });
  it("does not at any station", () => {
    for (let stop = 1; stop <= STATION_COUNT; stop++) expect(pageTargetGoes(BIG, { kind: "at", stop }, stop), `stop ${stop}`).toBe(false);
  });
  it("does not in flight, in either direction, at any share of it", () => {
    for (const [from, to] of [[0, 2], [2, 0], [1, 3], [0, 1]]) for (const f of [0, 0.01, 0.5, 0.99, 1])
      expect(pageTargetGoes(BIG, { kind: "flying", from, to, f }, to), `${from} to ${to} at ${f}`).toBe(false);
  });
  it("does not while a fade to a station runs (the camera still reads as the overview, the visit is going to the station)", () => {
    expect(pageTargetGoes(BIG, overview, 2)).toBe(false);
  });
  it("does at the overview in the second half of a fade back to it", () => {
    expect(pageTargetGoes(BIG, overview, 0)).toBe(true);
  });
  it("does not below the gate or on the portrait overview, even at the overview", () => {
    expect(pageTargetGoes(SMALL, overview, 0)).toBe(false);
    expect(pageTargetGoes(PORTRAIT, overview, 0)).toBe(false);
  });
});

describe("the two targets", () => {
  it("are the entries rack and desk-phone-target, each opening a page that exists, in the walk", () => {
    expect(PAGE_TARGETS.map((t) => t.id)).toEqual(["rack", "desk-phone-target"]);
    expect(pageTargets.map((t) => t.prop.id)).toEqual(["rack", "desk-phone-target"]);
    expect(pageTargets.map((t) => t.prop.kind)).toEqual(["target", "target"]);
    expect(props.filter((p) => p.kind === "target").map((p) => p.id)).toEqual(PAGE_TARGETS.map((t) => t.id));
    const order = walk();
    for (const { step } of PAGE_TARGETS) expect(order.some((s) => JSON.stringify(s) === JSON.stringify(step))).toBe(true);
  });
  it("open Home lab (Projects) and Contact (About me)", () => {
    const label = (step: (typeof PAGE_TARGETS)[number]["step"]) => {
      if (step.kind !== "page") throw new Error("a page");
      const s = stations.find((x) => x.id === step.station)!;
      return [s.name, s.pages.find((p) => p.id === step.page)!.label];
    };
    expect(PAGE_TARGETS.map((t) => label(t.step))).toEqual([["Projects", "Home lab"], ["About me", "Contact"]]);
    expect(stepAt(2)).not.toEqual(PAGE_TARGETS[0].step); // a page of the station, not its first
  });
});

// ---------------------------------------------------------------- the sweep

const WIDTHS = Array.from({ length: (2560 - 1280) / 8 + 1 }, (_, i) => 1280 + 8 * i);
const ASPECTS = [["16:9", 9 / 16], ["16:10", 10 / 16], ["4:3", 3 / 4], ["21:9", 9 / 21]] as const;
const POSES = ["at rest", "pointer at the bottom left", "pointer at the top left", "pointer at the bottom right", "pointer at the top right"];
/** The smallest a click target may be (spec #335, #386): CSS px each way. */
const MIN_TARGET = BUTTON_PX;

/** The windows of the sweep that are inside the gate (a 21:9 window is shorter than 720 px under 1680 wide), with the five poses of `reach` at each. */
function everyView() {
  return ASPECTS.flatMap(([name, ratio]) => WIDTHS.map((width) => ({ name, win: { width, height: Math.round(width * ratio) } })))
    .filter(({ win }) => pageTargetsOn(win))
    .map(({ name, win }) => ({ name, win, poses: reach(overviewPose(win)) }));
}

const camOf = (pose: Pose, win: Win) => {
  const cam = new PerspectiveCamera(pose.fov, win.width / win.height, 0.01, 50);
  cam.position.set(...pose.camera); cam.lookAt(new Vector3(...pose.look)); cam.updateMatrixWorld();
  return cam;
};
type P2 = [number, number];
/** World points as the camera puts them in the window (px from its top left). Null if any is behind the camera. */
const toWindow = (pts: Vector3[], cam: PerspectiveCamera, win: Win): P2[] | null => {
  const q = pts.map((p) => p.clone().project(cam));
  return q.some((p) => p.z > 1) ? null : q.map((p) => [(p.x * 0.5 + 0.5) * win.width, (-p.y * 0.5 + 0.5) * win.height]);
};
const boxOf = (name: string, q: P2[]): Box => {
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]), left = Math.min(...xs), top = Math.min(...ys);
  return { name, left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
};
const meets = (a: Box, b: Box) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

/** A target plane's four corners in the room, as the room draws it (`targetFrame`, the pose `TvTargets` gives the plane). */
function planeCorners(p: Prop): Vector3[] {
  const m = new Mesh(new PlaneGeometry(...p.size), new MeshBasicMaterial()), f = targetFrame(p);
  m.position.set(...f.position); m.rotation.set(f.rotation[0], f.rotation[1], f.rotation[2], f.rotation[3]); m.updateMatrixWorld();
  const g = m.geometry.getAttribute("position");
  return [0, 1, 3, 2].map((i) => new Vector3().fromBufferAttribute(g, i).applyMatrix4(m.matrixWorld));
}

/** A station's TV target: the bezel-sized plane `TvTargets` stands in front of the bezel layer. */
function tvCorners(crt: (typeof crts)[number]): Vector3[] {
  const a = (crt.yaw * Math.PI) / 180, d = SCREEN_LAYER + BEZEL_GAP + 0.003; // TARGET_GAP in TvTargets
  const at = new Vector3(crt.screen[0] + Math.sin(a) * d, crt.screen[1], crt.screen[2] + Math.cos(a) * d);
  return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([x, y]) => new Vector3(at.x + Math.cos(a) * x * BEZEL.width / 2, at.y + y * BEZEL.height / 2, at.z - Math.sin(a) * x * BEZEL.width / 2));
}

/** The desk meter's click target: the seven tubes, as a box round them in the meter's own frame (the tubes' radius each side, the front half). */
function meterCorners(): Vector3[] {
  const { tubeX, tubeY, tubeH, tubeR, position, yaw } = DESK_METER, c = Math.cos(yaw), s = Math.sin(yaw);
  return [tubeX(0) - tubeR, tubeX(6) + tubeR].flatMap((x) => [tubeY - tubeH / 2, tubeY + tubeH / 2].flatMap((y) => [0, tubeR].map((z) => new Vector3(position[0] + x * c + z * s, position[1] + y, position[2] - x * s + z * c))));
}

/** Every problem across the sweep, as lines: which target, window and pose, and what: under 44 px (the box round its four corners as the camera sees them, as src/visit/room-props.test.ts measures), or meeting another target, the
 *  desk meter, a pin or the Start button's box. `targets` is the layout's two targets, or the same with one changed. */
function sweep(targets: Prop[]): string[] {
  const found: string[] = [];
  for (const { name, win, poses } of everyView()) {
    const places = pinPlaces(overviewPose(win), win), start = { name: "the Start button", ...startBox(win) };
    poses.forEach((pose, i) => {
      const cam = camOf(pose, win), at = `at ${win.width} x ${win.height} (${name}), ${POSES[i]}`;
      const avoid: Box[] = [
        ...crts.map((c) => boxOf(`the ${c.id} TV's target`, toWindow(tvCorners(c), cam, win)!)),
        boxOf("the desk meter", toWindow(meterCorners(), cam, win)!),
        ...(places ? crts.map((_, k) => { const p = pinAt(k, cam, win); return { name: `pin ${k + 1}`, left: p.x - p.width / 2, top: p.y - p.height, width: p.width, height: p.height }; }) : []),
        start,
      ];
      for (const t of targets) {
        const q = toWindow(planeCorners(t), cam, win);
        if (!q) { found.push(`${t.id} ${at}: behind the camera`); continue; }
        const b = boxOf(t.id, q);
        if (b.width < MIN_TARGET || b.height < MIN_TARGET) found.push(`${t.id} ${at}: ${b.width.toFixed(0)} x ${b.height.toFixed(0)} px`);
        for (const o of avoid) if (meets(b, o)) found.push(`${t.id} ${at}: meets ${o.name}`);
      }
    });
  }
  return found;
}

const targets = pageTargets.map((t) => t.prop);

describe("the targets over the overview, inside the gate", () => {
  it("are swept at 1280 to 2560 px in steps of 8, at 16:9, 16:10, 4:3 and 21:9, on the poses of the mouse parallax's reach", () => {
    expect(WIDTHS.length).toBe(161);
    const views = everyView();
    expect(views.length).toBe(161 * 3 + (2560 - 1680) / 8 + 1); // 21:9 is under 720 px tall below 1680 px wide
    expect(views.every((v) => v.poses.length === 5 && pageTargetsOn(v.win))).toBe(true);
    for (const name of ["16:9", "16:10", "4:3", "21:9"]) expect(views.some((v) => v.name === name)).toBe(true);
    expect(views.some((v) => v.win.width === 1280 && v.win.height === 720)).toBe(true);
  });
  it("are each at least 44 x 44 px, and meet no station TV's target, the desk meter, a pin or the Start button's box, at every width, aspect and pose", () => {
    expect(sweep(targets)).toEqual([]);
  });
  it("keep the desk phone clear of the desk meter at 1280 x 720: apart sideways, though their rows overlap (design/335 found its lowest corner 11 px above the meter's first tube)", () => {
    const win = { width: 1280, height: 720 }, cam = camOf(reach(overviewPose(win))[0], win);
    const phone = boxOf("phone", toWindow(planeCorners(targets[1]), cam, win)!), meter = boxOf("meter", toWindow(meterCorners(), cam, win)!);
    expect(meets(phone, meter)).toBe(false);
    expect(phone.left - (meter.left + meter.width)).toBeGreaterThan(2); // about 2.6 px apart sideways at rest (7 px before the target was enlarged to cover the handset), with their rows overlapping
  });
  it("notices a target shrunk (the break check for the size rule): the rack at half its size, the desk phone at the display's", () => {
    const small = targets.map((p) => p.id === "rack" ? { ...p, size: [p.size[0] / 2, p.size[1] / 2] as [number, number] } : p);
    const rack = sweep(small);
    expect(rack.length).toBeGreaterThan(0);
    expect(rack.some((l) => l.startsWith("rack at 1280 x 720 (16:9), at rest"))).toBe(true);
    const display = props.find((p) => p.id === "desk-phone")!;
    const phone = sweep(targets.map((p) => p.id === "desk-phone-target" ? { ...p, size: display.size, tilt: display.tilt } : p));
    expect(phone.some((l) => l.startsWith("desk-phone-target at 1280 x 720 (16:9), at rest"))).toBe(true);
  });
  it("notices a target that meets the desk meter, a station TV's target, a pin or the Start button (the break check for the overlap rule)", () => {
    // a target moved onto each in turn: the rack onto the Work TV, the desk phone onto the desk meter
    const onWork = targets.map((p) => p.id === "rack" ? { ...p, centre: [crts[0].screen[0], crts[0].screen[1], crts[0].screen[2]] as Prop["centre"], yaw: crts[0].yaw, tilt: 0 } : p);
    expect(sweep(onWork).some((l) => l.startsWith("rack ") && l.includes("the work TV's target"))).toBe(true);
    const onMeter = targets.map((p) => p.id === "desk-phone-target" ? { ...p, centre: [DESK_METER.position[0], 0.9, DESK_METER.position[2]] as Prop["centre"] } : p);
    expect(sweep(onMeter).some((l) => l.startsWith("desk-phone-target ") && l.includes("the desk meter"))).toBe(true);
  });
});

describe("the Start button's box (src/pin.ts)", () => {
  it("is centred, at least 44 px tall, wider than its line, and stands above the meter device at 1280 x 720", () => {
    const win = { width: 1280, height: 720 }, b = startBox(win);
    expect(b.left + b.width / 2).toBeCloseTo(win.width / 2, 6);
    expect(b.height).toBeGreaterThanOrEqual(BUTTON_PX);
    expect(b.top + b.height).toBeLessThan(win.height);
    expect(b.width).toBeGreaterThan(200);
  });
});
