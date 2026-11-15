import { PerspectiveCamera, Vector3, type Camera } from "three";
import { crts, type Crt } from "./crts";
import { stations, ui } from "./content";
import { glassBox } from "./glass";
import { framingFor } from "./framing";
import { clearances, HUD_MARGIN, hudTier, LINK_ROW_H, LINK_ROW_W, NAME_BLOCK_H, NAME_BLOCK_W, SIDE } from "./pin";
import { parallax } from "./tour";
import type { Pose } from "./visit/flight";

// The numbered pins over the three stations at the overview (#293). One pure rule: where each pin stands, from the camera and the
// window, or none for all three. Pins are all or nothing: they show only where every pin clears the HUD's boxes (src/pin.ts), the meter
// device and the window's edge, and where no two pins touch. The overview's camera slides with the pointer (the mouse parallax), so the
// rule holds for the camera's whole reach, not only its resting place: a pin never meets the HUD wherever the pointer is.

/** The pill's height (px): a 22 px number disc, 6 px above and below and a 1 px border. */
export const PIN_H = 36;
/** The pill's foot (its stem, a 14 px line under the pill) ends this far above the glass's top edge. */
export const PIN_LIFT = 18;
// The pill's width is worked out from its text, as the line under the device is (src/pin.ts): a 15 px bold monospace character is taken as
// 0.602 of the type's size, the disc is 22 px and 8 px of gap from the text, then 8 px of padding at the disc's side and 12 at the text's end, and
// the border. PIN_SLACK is room each side for a font a little wider than the Mac's (the box is what the rule checks; the pill is as wide as its text).
export const PIN_FONT = 15, PIN_CHROME = 22 + 8 + 8 + 12 + 2, PIN_SLACK = 6;
/** Clear space the rule keeps round the HUD's boxes and the device (px): the HUD's backdrop, a 6 px spread shadow round each box (src/Hud.tsx). */
export const PIN_CLEAR = 6;

type Win = { width: number; height: number };

/** One pin's place: `x` is the pill's centre and `y` its bottom edge (window px), `width` and `height` the pill's box with its slack. */
export type PinPlace = { stop: number; x: number; y: number; width: number; height: number };
type Box = { left: number; top: number; width: number; height: number };

/** A pin's words, by station: "1 Work", "2 Projects", "3 About me". */
export const pinWords = (i: number) => ui.pins[stations[i].id];

/** The pill's box width for `text` (px): its own width and the slack each side. */
export const pinWidth = (text: string) => Math.ceil(PIN_CHROME + (text.length - 2) * 0.602 * PIN_FONT) + 2 * PIN_SLACK;

/** The window's boxes a pin must stay clear of at this window: the HUD's, and the meter device with its line. The one-row HUD is its two boxes
 *  (the name block and the link row); every other tier is taken as one band across the window at the HUD's height (`clearances`), which is
 *  wider than the HUD but is no use to a pin anyway: the pins show only from the one-row HUD in practice. */
export function hudBoxes(win: Win): Box[] {
  const { top, bottom } = clearances(win);
  const device: Box = { left: 0, top: win.height - bottom, width: win.width, height: bottom };
  if (hudTier(win) !== "oneRow") return [{ left: 0, top: 0, width: win.width, height: top }, device];
  return [
    { left: HUD_MARGIN, top: HUD_MARGIN, width: NAME_BLOCK_W, height: NAME_BLOCK_H },
    { left: win.width - HUD_MARGIN - LINK_ROW_W, top: HUD_MARGIN, width: LINK_ROW_W, height: LINK_ROW_H },
    device,
  ];
}

const camOf = (pose: Pose, win: Win) => {
  const cam = new PerspectiveCamera(pose.fov, win.width / win.height, 0.01, 50);
  cam.position.set(...pose.camera); cam.lookAt(new Vector3(...pose.look)); cam.updateMatrixWorld();
  return cam;
};

/** Where station `i`'s (0-based) pin stands as `camera` sees it, before it is kept in the window: over the middle of its glass's top edge, `PIN_LIFT` above. */
function rawAt(i: number, camera: Camera, win: Win): PinPlace & { glass: [number, number] } {
  const b = glassBox(crts[i], camera, win);
  return { stop: i + 1, x: b.left + b.width / 2, y: b.top - PIN_LIFT, width: pinWidth(pinWords(i)), height: PIN_H, glass: [b.left, b.left + b.width] };
}

/** Where station `i`'s (0-based) pin stands as `camera` sees it: `rawAt`, slid sideways to stay inside the window. The overview's camera slides
 *  with the pointer, which can carry a TV at the window's edge a little way out of it; its pin stays in, over what shows of the TV. */
export function pinAt(i: number, camera: Camera, win: Win): PinPlace {
  const { glass, ...p } = rawAt(i, camera, win);
  return { ...p, x: Math.min(Math.max(p.x, SIDE + p.width / 2), win.width - SIDE - p.width / 2) };
}

const boxOf = (p: PinPlace): Box => ({ left: p.x - p.width / 2, top: p.y - p.height, width: p.width, height: p.height });
const meets = (a: Box, b: Box, gap: number) =>
  a.left < b.left + b.width + gap && b.left < a.left + a.width + gap && a.top < b.top + b.height + gap && b.top < a.top + a.height + gap;

/** The camera's reach at the overview: where it rests, and where the mouse parallax takes it with the pointer at each corner of the window. */
export const reach = (pose: Pose): Pose[] => [pose, ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([x, y]): Pose => {
  const [dx, dy, dz] = parallax(pose.camera, pose.look, { x, y }, 1);
  return { ...pose, camera: [pose.camera[0] + dx, pose.camera[1] + dy, pose.camera[2] + dz] };
})];

/** Each pin, as a camera sees it, clear of the HUD, the device and each other (and over its glass, once kept in the window). */
function clear(places: PinPlace[], win: Win): boolean {
  const boxes = places.map(boxOf), avoid = hudBoxes(win);
  const apart = boxes.every((a, i) => boxes.every((b, j) => i === j || !meets(a, b, 0)));
  return apart && boxes.every((b) => avoid.every((h) => !meets(b, h, PIN_CLEAR)));
}

/** Each pin's place at the overview from the camera `pose` (the overview's resting pose) in window `win`, or null for all three: on a portrait
 *  window, or when any pin would meet the HUD or the device, leave the window or touch another pin. At the camera's rest no pin may need keeping
 *  in the window; wherever the pointer takes the camera, each pin, kept in, must still clear all of them and stand over its glass. */
export function pinPlaces(pose: Pose, win: Win): PinPlace[] | null {
  if (framingFor(win).name === "portrait") return null;
  const cams = reach(pose).map((p) => camOf(p, win));
  const rest = stations.map((_, i) => rawAt(i, cams[0], win));
  const restIn = rest.every((p) => p.x - p.width / 2 >= SIDE && p.x + p.width / 2 <= win.width - SIDE && p.y - p.height >= SIDE);
  if (!restIn) return null;
  for (const cam of cams) {
    const raw = stations.map((_, i) => rawAt(i, cam, win)), places = stations.map((_, i) => pinAt(i, cam, win));
    if (!clear(places, win) || places.some((p, i) => p.x < raw[i].glass[0] || p.x > raw[i].glass[1])) return null;
  }
  return stations.map((_, i) => pinAt(i, cams[0], win));
}

/** The overview's resting pose for this window, which `pinPlaces` is given at the overview. */
export function overviewPose(win: Win): Pose {
  const { camera, look, fov } = framingFor(win).cameraAt({ kind: "at", stop: 0 });
  return { camera, look, fov };
}
