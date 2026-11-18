// The one list of CRTs in the baked room, shared by the tour and the screen panels. For each
// station: where its CRT screen is, which way it faces, and the camera views the layout holds for it
// (used on phones and by build.py's --preview; the desktop stops come from stop.ts, not the layout).
// The three spare CRTs, which are no station, are listed apart.
// The numbers live in room-layout.json, which tools/room/build.py also reads to place the CRTs,
// so the room and the tour can't drift apart. Change a CRT's place there, then re-bake (`make room`).
// Positions are in site axes: x across, y up, +z toward the room's door.
// `with { type: "json" }` so a Playwright test can import this file (and the framing) in plain Node,
// which refuses a JSON import without it. useGap.ts imports its JSON bare: only Vite loads that one.
import layout from "./room-layout.json" with { type: "json" };

type V3 = [number, number, number];
/** A phone stop: where the camera stands, what it looks at and where the text is pinned. */
export type Stop = { camera: V3; look: V3; panel: V3 };
/** `panel` is where the station's text is pinned: the CRT screen, unless the layout gives a
 *  point beside it so the text leaves the station's subject in view (the home lab's rack).
 *  `portrait` is how much further back the camera stands on a portrait window (see src/framing).
 *  `phone`, if set, replaces that pull-back with its own stop on a portrait window, to bring lit
 *  parts of the room into a tall, narrow frame. Desktop never uses it. */
export type Crt = { id: string; screen: V3; yaw: number; camera: V3; look: V3; panel: V3; portrait: number; phone?: Stop };
type LayoutCrt = {
  id: string; screen: number[]; yaw: number; camera: number[]; look: number[]; panel?: number[]; portrait?: number;
  phone?: { camera: number[]; look: number[]; panel?: number[] };
};

/** Where the maker's plate and the sticky note sit on a TV's bezel: metres right of and up from the
 *  glass centre. The note sits near the baked note's spot (tools/room/build.py): it covers the part
 *  left of the glass, and the glass hides the rest (see Bezels.tsx). */
export const PLATE_AT = [-0.2, -0.21] as const;
export const NOTE_AT = [-0.258, 0.149] as const;
/** The glass on every CRT, in metres. */
export const CRT_GLASS = { width: 0.46, height: 0.36 };

const v3 = (a: number[]): V3 => [a[0], a[1], a[2]];

const toCrt = (c: LayoutCrt): Crt => ({
  id: c.id, screen: v3(c.screen), yaw: c.yaw, camera: v3(c.camera), look: v3(c.look),
  panel: v3(c.panel ?? c.screen), portrait: c.portrait ?? 1,
  ...(c.phone && { phone: { camera: v3(c.phone.camera), look: v3(c.phone.look), panel: v3(c.phone.panel ?? c.panel ?? c.screen) } }),
});

/** One entry per station, in tour order: Work, Projects (the bench TV), About me. Ids match the content module's station ids. */
export const crts: Crt[] = (layout.crts as LayoutCrt[]).map(toCrt);

/** The three spare CRTs: lit glass with no station, so not in `crts` (the code matches a TV's place in
 *  that list to its station). They have no card, no bezel layer, no glow and no click. Only Phosphor.tsx draws them. */
export const spares: Crt[] = (layout.spares as LayoutCrt[]).map(toCrt);

/** A prop's entry in room-layout.json's `props` (#379): a surface drawn on a prop, a drawn board or a click target. `centre` is the middle of its
 *  lit face (site axes, metres), `yaw` the way the face points (a CRT's: 0 toward +z, 90 toward +x), `size` the face's width and height in metres and
 *  `tilt` how many degrees the face's normal is raised above level (0 for an upright face). The ids of the surfaces are #378's. */
export type Prop = { id: string; kind: "surface" | "board" | "target"; centre: V3; yaw: number; tilt: number; size: [number, number] };
type LayoutProp = { id: string; kind: string; centre: number[]; yaw: number; tilt?: number; size: number[] };

/** Every prop the room's framing rule, the ambient surfaces and the click targets name, in the layout's order. */
export const props: Prop[] = (layout.props as LayoutProp[]).map((p) => ({
  id: p.id, kind: p.kind as Prop["kind"], centre: v3(p.centre), yaw: p.yaw, tilt: p.tilt ?? 0, size: [p.size[0], p.size[1]],
}));

/** The camera's vertical field of view, in degrees. */
export const CAMERA_FOV = 55;

/** The desk meter's place in the baked room. Numbers match build.py's meter: seven tubes in a
 *  row on a case at `position`, turned `yaw` radians. Tube positions are in the case's frame. */
const METER_YAW = (70 * Math.PI) / 180;
export const DESK_METER = {
  position: [-1.55, 0.76, 0.26] as V3,
  yaw: METER_YAW,
  tubeX: (i: number) => -0.18 + i * 0.06,
  tubeY: 0.135, tubeR: 0.027, tubeH: 0.064,
  /** The bottom and top of the first and last tubes' fronts, in room coordinates. */
  tubeEnds(): V3[] {
    const [px, py, pz] = DESK_METER.position, c = Math.cos(METER_YAW), s = Math.sin(METER_YAW), z = 0.03;
    const at = (x: number, y: number): V3 => [px + x * c + z * s, py + y, pz - x * s + z * c];
    const { tubeX, tubeY, tubeH } = DESK_METER;
    return [at(tubeX(0), tubeY - tubeH / 2), at(tubeX(0), tubeY + tubeH / 2), at(tubeX(6), tubeY - tubeH / 2), at(tubeX(6), tubeY + tubeH / 2)];
  },
};

/** The middle of the glass's right-hand edge, used to measure how wide the screen looks. */
export function glassEdge(crt: Crt): V3 {
  const a = (crt.yaw * Math.PI) / 180, h = CRT_GLASS.width / 2;
  return [crt.screen[0] + Math.cos(a) * h, crt.screen[1], crt.screen[2] - Math.sin(a) * h];
}

/** The glass's four corners in room coordinates. */
export function glassCorners(crt: Crt): V3[] {
  const a = (crt.yaw * Math.PI) / 180, hw = CRT_GLASS.width / 2, hh = CRT_GLASS.height / 2;
  return [-1, 1].flatMap((sx) => [-1, 1].map((sy): V3 => [crt.screen[0] + Math.cos(a) * hw * sx, crt.screen[1] + hh * sy, crt.screen[2] - Math.sin(a) * hw * sx]));
}

/** How far in front of the baked glass the phosphor (screen) layer stands (metres). The bezel layer and
 *  its edge are measured from this (draw.ts re-exports it for them). */
export const SCREEN_LAYER = 0.0062;
/** How much smaller than the glass the phosphor plane is while it carries a card, so it stays inside the bezel. */
export const PLANE_INSET = 0.012;

/** Where a CRT's phosphor plane stands: its centre, SCREEN_LAYER in front of the baked glass, and its yaw in radians. */
export function phosphorFrame(crt: Crt) {
  const a = (crt.yaw * Math.PI) / 180;
  return { position: [crt.screen[0] + Math.sin(a) * SCREEN_LAYER, crt.screen[1], crt.screen[2] + Math.cos(a) * SCREEN_LAYER] as V3, yaw: a };
}

/** The four corners of the phosphor plane in room coordinates, in glassCorners' order. `inset` is how much
 *  smaller than the glass the plane is (PLANE_INSET with a card on it, 0 for the clear glass). The plane
 *  stands SCREEN_LAYER in front of the glass, so seen at an angle it lies off the glass's own corners:
 *  to find what the plane shows, use these, not glassCorners. */
export function phosphorCorners(crt: Crt, inset = 0): V3[] {
  const { position: p, yaw: a } = phosphorFrame(crt), hw = (CRT_GLASS.width - inset) / 2, hh = (CRT_GLASS.height - inset) / 2;
  return [-1, 1].flatMap((sx) => [-1, 1].map((sy): V3 => [p[0] + Math.cos(a) * hw * sx, p[1] + hh * sy, p[2] - Math.sin(a) * hw * sx]));
}

/** The overview: where the camera stands to see every TV on a landscape window, and what it looks
 *  at. `fov` is its own vertical field of view, wider than CAMERA_FOV. `exit` is where flights leave it and arrive through. `portrait` is the pose for a portrait window: a good shot of lit parts of the room (not every TV). */
export const OVERVIEW = {
  camera: v3(layout.overview.camera), look: v3(layout.overview.look), fov: layout.overview.fov as number, exit: layout.overview.exit.map(v3),
  portrait: { camera: v3(layout.overviewPortrait.camera), look: v3(layout.overviewPortrait.look), exit: layout.overviewPortrait.exit.map(v3) },
};
