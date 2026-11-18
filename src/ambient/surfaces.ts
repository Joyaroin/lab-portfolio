import layout from "../room-layout.json" with { type: "json" };
import type { SavedCommit } from "../commits";
import { CRT_GLASS, phosphorFrame, spares } from "../crts";
import { drawFan, FAN_FRONT_M, FAN_H, FAN_W } from "./fan";
import { inFront } from "./front";
import { drawGitlog } from "./gitlog";
import { drawIronWisp, WISP_H, WISP_W } from "./iron-wisp";
import { drawOscilloscope, SCOPE_H, SCOPE_W } from "./oscilloscope";
import { drawPuzzle } from "./puzzle";
import { drawRackLights, RACK_H, RACK_W } from "./rack-lights";
import { drawRadio, RADIO_FRONT_M, RADIO_H, RADIO_W } from "./radio";
import { SCREEN_H, SCREEN_W, STILL_T } from "./still";
import { drawTraffic } from "./traffic";

// The room's ambient surfaces (ADR 0007, spec #335): the one list, so that `src/Phosphor.tsx` draws one mesh per entry and
// never names a surface. Pure: no canvas, no three.js. Each entry has its id, its canvas size, its `draw(ctx, t)` and its
// plane (where it stands in the room). The still frame is `draw` at STILL_T (the phase rule: `src/ambient/phase.ts`).
//
// An entry is filled (it draws) or a marked placeholder (an id and the size its canvas may be, and nothing else).
// A placeholder is left out of the tick, out of the stop and out of the room until its ticket fills it. A surface ticket
// edits its own placeholder's line, and no other: it replaces it with a filled entry of its own id and keeps its canvas within
// the reserved size (a unit test checks both, and the budget).

type Ctx = CanvasRenderingContext2D;
export type Size = { w: number; h: number };
/** Where a surface's plane stands: its centre in metres (site axes), its yaw in radians (0 faces +z), its tilt in radians (how far the
 *  plane's normal is raised above level: 0 is upright, as a CRT's glass is) and its size in metres. */
export type Plane = { position: [number, number, number]; yaw: number; tilt: number; width: number; height: number };

/** The rotation to give a three.js mesh (`rotation={planeRotation(plane)}`): yaw about the vertical, then the plane's face leant back by
 *  `tilt`. The Euler order is YXZ, so the tilt is about the plane's own horizontal axis: the normal ends at (sin yaw cos tilt, sin tilt, cos yaw cos tilt). */
export const planeRotation = (p: Plane): [number, number, number, "YXZ"] => [-p.tilt, p.yaw, 0, "YXZ"];
/** Paints frame `t` (ms). Returns `false` when the frame is the one already on the canvas (nothing was painted): the
 *  texture isn't uploaded then. Anything else, `undefined` included, means the canvas changed. */
export type Drawing = (c: Ctx, t: number) => boolean | void;
export type Surface = { id: string; size: Size; plane: Plane; draw: Drawing };
export type Placeholder = { id: string; size: Size; placeholder: true };
export type Entry = Surface | Placeholder;

export const isFilled = (e: Entry): e is Surface => !("placeholder" in e);

/** All the canvases together paint at most this many pixels per tick (spec #335). */
export const BUDGET_PX = 600_000;

/** The canvas each later surface may use: design/335's on-screen size at 1280×720, times 1.5 (for 1920×1080), up
 *  to a multiple of 8. A filled entry keeps within it. The sizes it was worked from (px at 1280×720, from `check-proposal.json`):
 *  oscilloscope screen 30×31, rack 55×129, soldering iron's wisp 3×32, fan 29×23, radio 101×58, desk phone 103×67, clock 49×48, laptop 90×71. */
export const RESERVED: Record<string, Size> = {
  "oscilloscope": { w: 96, h: 72 }, // raised from 48×48 by #381: at the Projects stop the scope is about 170 px wide at 1280×720, so 48 px is soft
  "rack-lights": { w: 88, h: 200 },
  "iron-wisp": { w: 16, h: 48 }, // raised from 8×48 by #381: the wisp's plane is 0.06×0.2 m, and 8 px is too thin to sway in
  "fan": { w: 48, h: 40 },
  "radio": { w: 152, h: 88 },
  "desk-phone": { w: 160, h: 104 },
  "clock": { w: 80, h: 72 },
  "laptop": { w: 136, h: 112 },
};

const placeholder = (id: keyof typeof RESERVED & string): Placeholder => ({ id, size: RESERVED[id], placeholder: true });

/** An entry in `src/room-layout.json`'s `props` list (#379): `centre` in metres (site axes), `yaw` in degrees (0 faces +z, 90 faces +x),
 *  `tilt` in degrees (how far the face's normal is raised above level; absent is 0, upright) and `size` (width, height) in metres. */
type LayoutProp = { id: string; centre: number[]; yaw: number; tilt?: number; size: number[] };

/** The plane of the surface `id`, from its entry in room-layout.json (centre, yaw, size and tilt). Throws if there is none, so a surface can't be filled without its place.
 *  Reads the JSON itself, so it doesn't wait for a typed export. */
export function layoutPlane(id: string, props: LayoutProp[] | undefined = (layout as { props?: LayoutProp[] }).props): Plane {
  const p = props?.find((e) => e.id === id);
  if (!p) throw new Error(`room-layout.json has no entry for the surface "${id}"`);
  const rad = (deg: number) => (deg * Math.PI) / 180;
  return { position: [p.centre[0], p.centre[1], p.centre[2]], yaw: rad(p.yaw), tilt: rad(p.tilt ?? 0), width: p.size[0], height: p.size[1] };
}

/** A surface on a baked prop: its plane is its entry in room-layout.json (by id), its canvas is `size`. */
const layoutSurface = (id: string, size: Size, draw: Drawing): Surface => ({ id, size, plane: layoutPlane(id), draw });

/** The glass over an ambient screen: scanlines and darker curved corners, as the station glass has. */
function drawGlass(g: Ctx) {
  g.fillStyle = "rgba(0,0,0,0.2)";
  for (let y = 0; y < SCREEN_H; y += 5) g.fillRect(0, y, SCREEN_W, 2);
  const v = g.createRadialGradient(SCREEN_W / 2, SCREEN_H / 2, SCREEN_H * 0.35, SCREEN_W / 2, SCREEN_H / 2, SCREEN_W * 0.68);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.85)");
  g.fillStyle = v; g.fillRect(0, 0, SCREEN_W, SCREEN_H);
}

/** What each spare CRT shows, by its id in room-layout.json. */
const SCREENS: Record<string, (commits: SavedCommit[]) => (c: Ctx, t: number) => void> = {
  "spare-work": (commits) => (c, t) => drawGitlog(c, t, commits),
  "spare-home-lab": () => drawTraffic,
  "spare-software-factory": () => drawPuzzle,
};

/** A spare CRT's screen: 400×300, drawn at full glass size (not inset: the baked glass must not show round it as a bright rim), then the glass. */
const screen = (id: string, commits: SavedCommit[]): Surface => {
  const crt = spares.find((c) => c.id === id)!, paint = SCREENS[id](commits);
  const f = phosphorFrame(crt);
  return {
    id, size: { w: SCREEN_W, h: SCREEN_H },
    plane: { position: f.position, yaw: f.yaw, tilt: 0, width: CRT_GLASS.width, height: CRT_GLASS.height },
    draw: (g, t) => { g.save(); paint(g, t); g.restore(); g.save(); drawGlass(g); g.restore(); },
  };
};

/** The list, in the order they are drawn. `commits` is the git log screen's (`src/Phosphor.tsx` imports the saved file: only a file directly in `src/` can). */
export const ambientSurfaces = (commits: SavedCommit[]): Entry[] => [
  ...spares.map((crt) => screen(crt.id, commits)),
  // Placeholders, one per later surface, each filled by its own ticket on its own line.
  layoutSurface("oscilloscope", { w: SCOPE_W, h: SCOPE_H }, drawOscilloscope), // #381
  layoutSurface("rack-lights", { w: RACK_W, h: RACK_H }, drawRackLights), // #381
  layoutSurface("iron-wisp", { w: WISP_W, h: WISP_H }, drawIronWisp), // #381
  { id: "fan", size: { w: FAN_W, h: FAN_H }, plane: inFront(layoutPlane("fan"), FAN_FRONT_M), draw: drawFan }, // #382
  { id: "radio", size: { w: RADIO_W, h: RADIO_H }, plane: inFront(layoutPlane("radio"), RADIO_FRONT_M), draw: drawRadio }, // #382
  placeholder("desk-phone"), // #383
  placeholder("clock"), // #383
  placeholder("laptop"), // #384
];

/** Pixels a tick paints: the filled surfaces' canvases and the placeholders' reserved ones. */
export const pixelsPerTick = (list: Entry[]) => list.reduce((n, e) => n + e.size.w * e.size.h, 0);

/** A surface's canvas as the room holds it: the context to draw into and what to call when the canvas changed (sets the texture's needsUpdate). */
export type Bound = { ctx: Ctx; upload: () => void };

/** The one tick and the one stop for every filled surface. `bind` gives each filled surface its canvas; placeholders are never bound.
 *  `tick(t)` draws every filled surface at `t`; `still()` draws every one at STILL_T, the frame it holds wherever the timer isn't running
 *  (the timer's stop puts it back; the room calls it once before the timer first starts). A surface whose `draw` returns `false`
 *  keeps its canvas and is not uploaded. */
export function createSurfaceDriver(list: Entry[], bind: (s: Surface) => Bound) {
  const bound = list.filter(isFilled).map((s) => ({ s, ...bind(s) }));
  const paint = (t: number) => bound.forEach(({ s, ctx, upload }) => {
    ctx.save();
    const unchanged = s.draw(ctx, t) === false;
    ctx.restore();
    if (!unchanged) upload();
  });
  return { surfaces: bound.map((b) => b.s), tick: paint, still: () => paint(STILL_T) };
}
