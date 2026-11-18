import { describe, it, expect } from "vitest";
import { props, type Prop } from "../crts";
import { overviewPose, reach } from "../pins";
import { corners, faceNormal, type V3 } from "../../tests/lib/prop-face";
import { firstHit, primitiveVertexCounts, triangleVertices } from "../../tests/lib/room-mesh";

// #380: line of sight, on the baked room. From the overview camera, at rest and at each of `reach`'s five poses (the mouse parallax's far corners),
// a ray to each of a listed prop's points must arrive without meeting another prop first. The triangles are the committed src/assets/room.glb's
// (tests/lib/room-mesh.ts), so a re-bake that puts something in front of a prop fails here. The framing (in the window, clear of the HUD) is room-props.test.ts's.

const sum = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** The props whose points are tested: every entry that is a prop's own lit face. Two are left out because their entry is a box over more than the lit face:
 *  `desk-phone-target` encloses the whole phone, so its faces are inside the phone's own mesh (the phone is tested by its display, `desk-phone`); `rack` runs
 *  from the floor to the top, and its lower corners are behind the desk in front of it (the rack is tested by its lit face, `rack-lights`, as design/335 did). */
const NOT_A_FACE = ["desk-phone-target", "rack"];
const SEEN = props.filter((p) => !NOT_A_FACE.includes(p.id));
/** How far in front of its entry a prop's points are taken: 1 cm, as design/335's check did, except the fan, whose entry is the blades' axle and whose blades
 *  stand 3 cm in front of it. */
const LIFT: Record<string, number> = { fan: 0.04 };
/** A ray may arrive this short of its point (metres) and count as arriving: a face's own bevel and the ledge round a screen. */
const SLACK = 0.005;

/** How far out to its edge a prop's points go: 90%, as design/335's probes were (the radio's, 0.13 of its 0.15 half width), so a point is on the prop and not on its rim. */
const INSET = 0.9;
/** Framed props whose entry is a box round a shape that does not fill it: the racket is a head on a handle and the tube stands beside a ball. Their points are the centre and
 *  the middle of each edge (the head's top, the grip's bottom, the head's two sides), not the corners, which are empty air that another prop can stand in front of. */
const BY_EDGES = ["racket", "ball-tube"];

/** A prop's points: its centre and four more, the corners (or, for `BY_EDGES`, the middles of the edges) pulled in to `INSET` and lifted off the face. */
function points(p: Prop): V3[] {
  const n = faceNormal(p), lift = LIFT[p.id] ?? 0.01, [c0, c1, c2, c3] = corners(p);
  const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const edge: V3[] = BY_EDGES.includes(p.id) ? [mid(c0, c1), mid(c1, c2), mid(c2, c3), mid(c3, c0)] : [c0, c1, c2, c3];
  const pulled = edge.map((e): V3 => [0, 1, 2].map((i) => p.centre[i] + (e[i] - p.centre[i]) * INSET) as V3);
  return [p.centre, ...pulled].map((c) => sum(c, n, lift));
}

/** The overview camera's positions: at rest and with the pointer at each corner, at 16:9 and 16:10 (the camera does not depend on the window's size). */
function cameras(): V3[] {
  const seen = new Map<string, V3>();
  for (const win of [{ width: 1280, height: 720 }, { width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 2560, height: 1600 }])
    for (const pose of reach(overviewPose(win))) seen.set(pose.camera.map((v) => v.toFixed(6)).join(","), pose.camera as V3);
  return [...seen.values()];
}
const POSES = ["at rest", "pointer at the bottom left", "pointer at the top left", "pointer at the bottom right", "pointer at the top right"];

/** Every point of `list` a ray from a camera pose can't reach, as lines: which prop, which point, which pose, how far in front the blocker is. */
function hidden(list: Prop[]): string[] {
  const out: string[] = [];
  const cams = cameras();
  for (const p of list) for (const [pi, pt] of points(p).entries()) for (const [ci, cam] of cams.entries()) {
    const dist = Math.hypot(pt[0] - cam[0], pt[1] - cam[1], pt[2] - cam[2]), hit = firstHit(cam, pt);
    if (hit < dist - SLACK) out.push(`${p.id}, point ${pi}, ${POSES[ci] ?? `pose ${ci}`}: something is ${(dist - hit).toFixed(2)} m in front of it`);
  }
  return out;
}

/** #380: a surface drawn at runtime must be able to hide what is baked under it, so nothing baked inside the clock's disc may stand in front of the entry's plane by more
 *  than the printed ticks' depth (2.5 mm, and 1 mm over). The clock's hands are the surface's: baked, they stood 3 to 5 mm in front of it. The clock hangs on the right wall, its face toward -x. */
const CLOCK_TICKS = 0.0035;
function inFrontOfClock(vertices: V3[]): string[] {
  const clock = props.find((p) => p.id === "clock")!, r = clock.size[0] / 2;
  return vertices
    .filter((v) => Math.hypot(v[1] - clock.centre[1], v[2] - clock.centre[2]) <= r && clock.centre[0] - v[0] > CLOCK_TICKS)
    .map((v) => `(${v.map((c) => c.toFixed(4)).join(", ")}) is ${((clock.centre[0] - v[0]) * 1000).toFixed(1)} mm in front of the clock's plane`);
}

describe("the room's line of sight", () => {
  it("looks from the five poses of the mouse parallax's reach", () => {
    expect(cameras().length).toBe(5);
  });
  it("has every listed prop's points in sight from the overview camera, at rest and at each pose of reach", () => {
    expect(hidden(SEEN)).toEqual([]);
  });
  it("tests the props that #380 adds and moves, among the rest", () => {
    for (const id of ["desk-phone", "laptop", "clock", "racket", "ball-tube", "whiteboard", "radio", "fan"]) expect(SEEN.map((p) => p.id), id).toContain(id);
  });
  it("notices the opened laptop back where the closed one was (-1.62, 0.77, -0.80), behind the old Work TV (the break check)", () => {
    const moved = SEEN.map((p) => (p.id === "laptop" ? { ...p, centre: [-1.62, 0.77, -0.8] as V3 } : p));
    const found = hidden(moved);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((l) => l.startsWith("laptop,"))).toBe(true);
  });
  it("notices a prop with a wall between it and the camera", () => {
    // the back wall's inside face is at z -1.9: a point behind it is hidden from every pose
    const behind = SEEN.map((p) => (p.id === "whiteboard" ? { ...p, centre: [1.1, 1.43, -2.2] as V3 } : p));
    expect(hidden(behind).filter((l) => l.startsWith("whiteboard,")).length).toBeGreaterThan(0);
  });
  it("keeps every primitive of the model under the 16-bit index ceiling (65,535 vertices), the props mesh among them", () => {
    const counts = primitiveVertexCounts();
    expect(counts.length).toBeGreaterThan(0);
    for (const c of counts) expect(c).toBeLessThanOrEqual(65535);
  });
  it("bakes nothing in the clock's disc more than 3.5 mm in front of the clock's plane, so a surface can draw the hands (#380)", () => {
    expect([...new Set(inFrontOfClock(triangleVertices()))]).toEqual([]);
  });
  it("notices a baked hand: a vertex 5 mm in front of the clock's plane, inside its disc (the break check)", () => {
    const clock = props.find((p) => p.id === "clock")!;
    expect(inFrontOfClock([[clock.centre[0] - 0.005, clock.centre[1] + 0.03, clock.centre[2]]]).length).toBe(1);
    expect(inFrontOfClock([[clock.centre[0] - 0.005, clock.centre[1] + 0.2, clock.centre[2]]]).length).toBe(0);
  });
});
