import { describe, it, expect } from "vitest";
import { CAMERA_FOV, props, type Prop } from "../crts";
import { clearances, deviceSize, HUD_MARGIN, hudTier, isCompact, LINK_ROW_H, LINK_ROW_W, lineHeight, lineMaxWidth, lineTexts, lineType, NAME_BLOCK_H, NAME_BLOCK_W } from "../pin";
import { overviewPose, PIN_CLEAR, reach } from "../pins";
import { corners, cross, type V3 } from "../../tests/lib/prop-face";
import type { Pose } from "./flight";

// #379: every prop the room's framing rule names is in the window and clear of the HUD's boxes at the landscape overview, at every width
// from 1280 to 2560 px (steps of 8 px), at 16:9 and 16:10, and wherever the mouse parallax takes the camera (`reach`'s five poses).
// Pure projection of the entries in src/room-layout.json, with no browser, by the camera's own maths (as flight.test.ts does).
// Line of sight (one prop hidden behind another) needs the baked model: it is #380's.

type Box = { name: string; left: number; top: number; width: number; height: number };
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

/** Where a point lands in a window, in px from its top left, by the camera's projection (vertical field the pose's fov); null if it is behind the camera. */
function project(pose: Pose, p: V3, win: Win): [number, number] | null {
  const f = norm(sub(pose.look, pose.camera)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), d = sub(p, pose.camera), z = dot(d, f);
  const tan = Math.tan(((pose.fov ?? CAMERA_FOV) * Math.PI) / 360), aspect = win.width / win.height;
  if (z <= 0) return null;
  return [((dot(d, r) / z / (tan * aspect) + 1) / 2) * win.width, ((1 - dot(d, u) / z / tan) / 2) * win.height];
}

type Win = { width: number; height: number };
const CHAR_EM = 0.602, LINE_SIDE = 20; // as src/pin.ts: a monospace character's width in em, and the line's padding at both sides

/** The HUD's boxes at a landscape window: the name block, the link row, the meter device, and the line under the device (its box is the widest
 *  text it can show: 0.602 em a character plus 20 px of side padding, never wider than `lineMaxWidth`, centred and `lineHeight` tall,
 *  above the 16 px the HUD leaves under it). */
function hudBoxes(win: Win): Box[] {
  expect(hudTier(win), `${win.width} x ${win.height} has the one-row HUD`).toBe("oneRow");
  const device = deviceSize(win), { bottom } = clearances(win), lh = lineHeight(win);
  const lineW = Math.min(lineMaxWidth(win), Math.max(...lineTexts(isCompact(win)).map((t) => t.length)) * CHAR_EM * lineType(win).font + LINE_SIDE);
  return [
    { name: "the name block", left: HUD_MARGIN, top: HUD_MARGIN, width: NAME_BLOCK_W, height: NAME_BLOCK_H },
    { name: "the link row", left: win.width - HUD_MARGIN - LINK_ROW_W, top: HUD_MARGIN, width: LINK_ROW_W, height: LINK_ROW_H },
    { name: "the meter device", left: (win.width - device.width) / 2, top: win.height - bottom, width: device.width, height: device.height },
    { name: "the line under the device", left: (win.width - lineW) / 2, top: win.height - 16 - lh, width: lineW, height: lh },
  ];
}

// `reach`'s poses, in its order (pointer x, y from -1 to 1, y up): at rest, then the pointer at the window's bottom left, top left, bottom right
// and top right. The ticket's "reach pose 2" is index 2, the pointer at the top left.
const POSES = ["at rest", "pointer at the bottom left", "pointer at the top left", "pointer at the bottom right", "pointer at the top right"];
const TOP_LEFT = 2;

/** A prop's box in a window: the box round its four projected corners, in px; null if any corner is behind the camera. */
function bbox(p: Prop, pose: Pose, win: Win): { left: number; right: number; top: number; bottom: number } | null {
  const q = corners(p).map((c) => project(pose, c, win));
  if (q.some((x) => x === null)) return null;
  const xs = q.map((x) => x![0]), ys = q.map((x) => x![1]);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

/** What is wrong with a prop at one window and pose: out of the window, behind the camera, or within `PIN_CLEAR` of a HUD box. */
function problems(p: Prop, pose: Pose, win: Win, boxes: Box[]): { what: string; box?: string }[] {
  const b0 = bbox(p, pose, win);
  if (!b0) return [{ what: "behind the camera" }];
  const { left, right, top, bottom } = b0;
  const out: { what: string; box?: string }[] = [];
  if (left < 0 || top < 0 || right > win.width || bottom > win.height) out.push({ what: `outside the window (${left.toFixed(0)}-${right.toFixed(0)} x ${top.toFixed(0)}-${bottom.toFixed(0)})` });
  for (const b of boxes)
    if (left < b.left + b.width + PIN_CLEAR && b.left < right + PIN_CLEAR && top < b.top + b.height + PIN_CLEAR && b.top < bottom + PIN_CLEAR)
      out.push({ what: `within ${PIN_CLEAR} px of ${b.name} (${left.toFixed(0)}-${right.toFixed(0)} x ${top.toFixed(0)}-${bottom.toFixed(0)})`, box: b.name });
  return out;
}

/** Adham's one exception (2026-11-18, on #379): at 16:10, 1280 to 1303 px wide, with the pointer at the window's top left (`reach`'s pose 2),
 *  the whiteboard may meet the name block. The board stays where it was agreed; every other prop, window and pose holds. */
const exempt = (p: Prop, win: Win, pose: number, box?: string) =>
  p.id === "whiteboard" && box === "the name block" && pose === TOP_LEFT && win.width >= 1280 && win.width <= 1303 && Math.round(win.width * 10 / 16) === win.height;

const WIDTHS = Array.from({ length: (2560 - 1280) / 8 + 1 }, (_, i) => 1280 + 8 * i);
const ASPECTS = [["16:9", 9 / 16], ["16:10", 10 / 16]] as const;

/** Every problem across the sweep, as lines: which prop, window, pose and what. */
function sweep(list: Prop[], skip = exempt): string[] {
  const found: string[] = [];
  for (const [name, ratio] of ASPECTS) for (const width of WIDTHS) {
    const win = { width, height: Math.round(width * ratio) }, boxes = hudBoxes(win), poses = reach(overviewPose(win));
    for (const p of list) poses.forEach((pose, i) => {
      for (const x of problems(p, pose, win, boxes)) if (!skip(p, win, i, x.box)) found.push(`${p.id} at ${width} x ${win.height} (${name}), ${POSES[i]}: ${x.what}`);
    });
  }
  return found;
}

const NAMED = ["oscilloscope", "rack-lights", "iron-wisp", "fan", "radio", "desk-phone", "clock", "laptop", "whiteboard", "rack", "desk-phone-target", "racket", "ball-tube"];
/** The smallest a click target may be (spec #335, #386): CSS px each way. */
const MIN_TARGET = 44;

describe("the room's props", () => {
  it("are the ones the ticket names, each once, in the four kinds", () => {
    expect(props.map((p) => p.id)).toEqual(NAMED);
    expect(props.filter((p) => p.kind === "surface").map((p) => p.id)).toEqual(NAMED.slice(0, 8));
    expect(props.filter((p) => p.kind === "board").map((p) => p.id)).toEqual(["whiteboard"]);
    expect(props.filter((p) => p.kind === "target").map((p) => p.id)).toEqual(["rack", "desk-phone-target"]);
    expect(props.filter((p) => p.kind === "prop").map((p) => p.id)).toEqual(["racket", "ball-tube"]);
  });
  it("have exactly two clicks, the rack and the whole desk phone (the display is a surface, the racket and the tube are framing only)", () => {
    expect(props.filter((p) => p.kind === "target").map((p) => p.id).sort()).toEqual(["desk-phone-target", "rack"]);
  });
  it("each have a centre, a yaw and a size", () => {
    for (const p of props) {
      expect(p.centre.every(Number.isFinite), p.id).toBe(true);
      expect(Number.isFinite(p.yaw), p.id).toBe(true);
      expect(p.size[0], p.id).toBeGreaterThan(0);
      expect(p.size[1], p.id).toBeGreaterThan(0);
    }
  });
  it("put the whiteboard and the fan where the design agreed", () => {
    const get = (id: string) => props.find((p) => p.id === id)!;
    expect([get("whiteboard").centre[0], get("whiteboard").centre[1]]).toEqual([1.1, 1.43]);
    expect(get("whiteboard").size).toEqual([0.48, 0.36]);
    expect(get("fan").centre).toEqual([-0.78, 1.01, -1.72]);
  });
});

/** The sweep's windows with the poses of `reach` at each: where the click targets are measured. */
function everyView(): { win: Win; pose: Pose; i: number }[] {
  return ASPECTS.flatMap(([, ratio]) => WIDTHS.flatMap((width) => {
    const win = { width, height: Math.round(width * ratio) };
    return reach(overviewPose(win)).map((pose, i) => ({ win, pose, i }));
  }));
}
/** The widths and heights (px) of a click target at every window and pose of the sweep that fall short of `MIN_TARGET` either way. */
function tooSmall(list: Prop[]): string[] {
  return everyView().flatMap(({ win, pose, i }) => list.filter((p) => p.kind === "target").flatMap((p) => {
    const b = bbox(p, pose, win)!, w = b.right - b.left, h = b.bottom - b.top;
    return w < MIN_TARGET || h < MIN_TARGET ? [`${p.id} at ${win.width} x ${win.height}, ${POSES[i]}: ${w.toFixed(0)} x ${h.toFixed(0)} px`] : [];
  }));
}

describe("the overview's framing rule over the props", () => {
  it("sweeps 1280 to 2560 px in steps of 8 at both aspects, on the poses of the mouse parallax's reach", () => {
    expect(WIDTHS.length).toBe(161);
    expect(reach(overviewPose({ width: 1280, height: 720 })).length).toBe(5);
  });
  it("has every prop in the window and clear of the HUD's boxes, at every width, aspect and pose (bar the one named exception)", () => {
    expect(sweep(props)).toEqual([]);
  });
  it("has no problem the exception hides apart from the whiteboard's corner under the name block at 16:10, 1280 to 1303 px, pointer top left", () => {
    // the exception is by name: it hides nothing else, and it is a real overlap (else it would be a looser margin)
    const all = sweep(props, () => false);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((l) => l.startsWith("whiteboard at 1") && l.includes("(16:10)") && l.includes("pointer at the top left") && l.includes("the name block"))).toBe(true);
    const widths = all.map((l) => Number(l.match(/at (\d+) x/)![1]));
    expect(Math.min(...widths)).toBe(1280);
    expect(Math.max(...widths)).toBeLessThanOrEqual(1303);
  });
  it("gives the desk phone's target the whole phone's size at rest, 119 x 71 px at 1280 x 720 (the base alone is design/335's 103 x 67), against the display's 29 x 23", () => {
    const win = { width: 1280, height: 720 }, pose = reach(overviewPose(win))[0], get = (id: string) => bbox(props.find((p) => p.id === id)!, pose, win)!;
    const t = get("desk-phone-target"), d = get("desk-phone");
    expect([t.right - t.left, t.bottom - t.top].map(Math.round)).toEqual([119, 71]); // the base alone (0.20 x 0.22 m) is design/335's 103 x 67; the handset reaches past it
    expect(t.right - t.left).toBeGreaterThanOrEqual(103);
    expect(t.bottom - t.top).toBeGreaterThanOrEqual(67);
    expect(d.right - d.left).toBeLessThan(MIN_TARGET);
    expect(t.left).toBeLessThanOrEqual(d.left);
    expect(t.right).toBeGreaterThanOrEqual(d.right);
    expect(t.top).toBeLessThanOrEqual(d.top);
    expect(t.bottom).toBeGreaterThanOrEqual(d.bottom);
  });
  it("keeps every click target at least 44 x 44 px at every width, aspect and pose of the sweep", () => {
    expect(tooSmall(props)).toEqual([]);
  });
  it("notices a desk phone target shrunk back to the display's size (the break check for the 44 px rule)", () => {
    const display = props.find((p) => p.id === "desk-phone")!;
    const shrunk = props.map((p) => p.id === "desk-phone-target" ? { ...p, size: display.size, tilt: display.tilt } : p);
    const found = tooSmall(shrunk);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((l) => l.startsWith("desk-phone-target "))).toBe(true);
    expect(found.some((l) => l.startsWith("desk-phone-target at 1280 x 720, at rest"))).toBe(true);
  });
  it("notices a whiteboard moved back under the name block (the break check)", () => {
    const moved = props.map((p) => p.id === "whiteboard" ? { ...p, centre: [0.68, 1.55, p.centre[2]] as V3 } : p);
    const found = sweep(moved);
    expect(found.some((l) => l.startsWith("whiteboard at 1280 x 720 (16:9)") && l.includes("the name block"))).toBe(true);
  });
  it("notices a prop outside the window", () => {
    const out = props.map((p) => p.id === "clock" ? { ...p, centre: [3, 1.45, 0.68] as V3 } : p);
    expect(sweep(out).some((l) => l.startsWith("clock ") && l.includes("outside the window"))).toBe(true);
  });
  it("has the line under the meter device as wide as its widest text, centred under the device and inside the window", () => {
    const win = { width: 1280, height: 720 }, [, , device, line] = hudBoxes(win);
    expect(device.width).toBeCloseTo(371.2, 1);
    expect(line.width).toBeGreaterThan(720); // about 731: much wider than the device
    expect(line.width).toBeLessThanOrEqual(lineMaxWidth(win));
    expect(line.left + line.width / 2).toBeCloseTo(win.width / 2, 6);
    expect(line.top).toBeGreaterThanOrEqual(device.top + device.height);
    expect(line.top + line.height).toBe(win.height - 16);
  });
  it("notices a prop under the line beside the device, which is clear of the device itself (the break check for the line's box)", () => {
    const win = { width: 1280, height: 720 }, [, , device, line] = hudBoxes(win), pose = reach(overviewPose(win))[0];
    const x = (line.left + 20 + (device.left - 20)) / 2, y = line.top + line.height / 2; // between the line's left end and the device's, in the line's row
    expect(x).toBeLessThan(device.left);
    // a 1 mm face on the camera ray through that point of the window, 2 m out
    const p = (cx: number, cy: number): V3 => {
      const f = norm(sub(pose.look, pose.camera)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
      const tan = Math.tan(((pose.fov ?? CAMERA_FOV) * Math.PI) / 360), nx = ((cx / win.width) * 2 - 1) * tan * (win.width / win.height), ny = (1 - (cy / win.height) * 2) * tan;
      return [0, 1, 2].map((i) => pose.camera[i] + 2 * (f[i] + r[i] * nx + u[i] * ny)) as V3;
    };
    const probe: Prop = { id: "probe", kind: "target", centre: p(x, y), yaw: 0, tilt: 0, size: [0.001, 0.001] };
    const found = problems(probe, pose, win, hudBoxes(win));
    expect(found.map((f) => f.box)).toEqual(["the line under the device"]);
  });
});
