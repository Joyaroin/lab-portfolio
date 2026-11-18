import { cyclePosition } from "./phase";

// The radio's dial and signal bars (#382, spec #335): one pure drawing, `drawRadio(c, t)`. The plane is the `radio` entry of
// src/room-layout.json (the radio's face, 0.30 × 0.16 m, facing −x), so the canvas has that shape: 150 × 80, 500 px a metre.
// Everything but the dial, its glow and the bars is transparent, so the baked wood shows round them.
//
// Where the plane stands: the entry is the face at x 1.56. The baked dial (tools/room/build.py) is a 1 cm black disc on the face,
// x 1.55 to 1.56, so a plane at the face would be behind it. The plane stands RADIO_FRONT_M in front of the entry, at x 1.548, 2 mm in
// front of the baked dial, and draws the dial over it (`ambientSurfaces` applies the offset, with `inFront`).

export const RADIO_W = 150;
export const RADIO_H = 80;
export const RADIO_FRONT_M = 0.012;
/** The whole cycle, in ms. The glow hunts for RADIO_HUNT_MS of it, from RADIO_HUNT_FROM; the rest (2 s, either side of the still frame) it is at rest. */
export const RADIO_CYCLE_MS = 8000;
export const RADIO_HUNT_FROM = 1000;
export const RADIO_HUNT_MS = 6000;
/** The still frame is at the start of the cycle: the middle of the rest. */
export const RADIO_STILL_POS = 0;
export const RADIO_BARS = 5;
/** The glow's place on the dial's arc, 0 to 1: at rest, and furthest along. */
export const DIAL_REST = 0.15;
export const DIAL_FAR = 0.9;
/** A bar's height, as a share of its full height: at rest. */
export const BAR_LOW = 0.12;

/** How far through the hunt the radio is, 0 to 1, or `null` at rest. */
function hunt(t: number) {
  const c = cyclePosition(t, RADIO_CYCLE_MS, RADIO_STILL_POS);
  return c >= RADIO_HUNT_FROM && c < RADIO_HUNT_FROM + RADIO_HUNT_MS ? (c - RADIO_HUNT_FROM) / RADIO_HUNT_MS : null;
}

/** Where the dial's glow is at `t`, 0 to 1 along the arc: it leaves DIAL_REST, runs out to DIAL_FAR with a wobble (it hunts) and comes back. */
export function dialGlow(t: number) {
  const a = hunt(t);
  if (a === null) return DIAL_REST;
  const s = Math.sin(Math.PI * a) ** 2 + 0.08 * Math.sin(6 * Math.PI * a) * Math.sin(Math.PI * a);
  return DIAL_REST + (DIAL_FAR - DIAL_REST) * Math.min(1, Math.max(0, s));
}

/** The signal bars' heights at `t`, each 0 to 1: all BAR_LOW at rest; during the hunt they rise and fall, each out of step with its neighbour. */
export function barHeights(t: number): number[] {
  const a = hunt(t);
  return Array.from({ length: RADIO_BARS }, (_, i) => {
    if (a === null) return BAR_LOW;
    return BAR_LOW + (1 - BAR_LOW) * Math.sin(Math.PI * a) * (0.5 + 0.5 * Math.sin(2 * Math.PI * (3 * a + i / RADIO_BARS)));
  });
}

const DIAL_X = RADIO_W / 2, DIAL_Y = RADIO_H / 2, DIAL_R = 21;
const ARC_FROM = (150 * Math.PI) / 180, ARC_SPAN = (240 * Math.PI) / 180; // clockwise from lower left, over the top, to lower right

export function drawRadio(c: CanvasRenderingContext2D, t: number) {
  c.clearRect(0, 0, RADIO_W, RADIO_H);
  const pos = dialGlow(t);
  // the dial: a dark disc over the baked one, a ring and ticks round it
  c.fillStyle = "#0c0804"; c.beginPath(); c.arc(DIAL_X, DIAL_Y, DIAL_R, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#6a4a22"; c.lineWidth = 1;
  c.beginPath(); c.arc(DIAL_X, DIAL_Y, DIAL_R - 0.5, 0, Math.PI * 2); c.stroke();
  for (let k = 0; k <= 8; k++) {
    const a = ARC_FROM + (k / 8) * ARC_SPAN, cos = Math.cos(a), sin = Math.sin(a);
    c.beginPath(); c.moveTo(DIAL_X + cos * (DIAL_R - 7), DIAL_Y + sin * (DIAL_R - 7)); c.lineTo(DIAL_X + cos * (DIAL_R - 3), DIAL_Y + sin * (DIAL_R - 3)); c.stroke();
  }
  // the glow, on the arc at `pos`, and the needle to it
  const a = ARC_FROM + pos * ARC_SPAN, gx = DIAL_X + Math.cos(a) * (DIAL_R - 6), gy = DIAL_Y + Math.sin(a) * (DIAL_R - 6);
  c.strokeStyle = "#ffb04a"; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(DIAL_X, DIAL_Y); c.lineTo(gx, gy); c.stroke();
  const glow = c.createRadialGradient(gx, gy, 0, gx, gy, 9);
  glow.addColorStop(0, "rgba(255,176,74,0.95)"); glow.addColorStop(1, "rgba(255,176,74,0)");
  c.fillStyle = glow; c.beginPath(); c.arc(gx, gy, 9, 0, Math.PI * 2); c.fill();
  // the signal bars, on a dark backing to the dial's right
  const bx = 104, by = 18, bw = 40, bh = 44;
  c.fillStyle = "#120c06"; c.fillRect(bx, by, bw, bh);
  c.fillStyle = "#ffb04a";
  barHeights(t).forEach((h, i) => {
    const full = bh - 8, hh = Math.max(2, Math.round(full * h));
    c.fillRect(bx + 4 + i * 7, by + bh - 4 - hh, 5, hh);
  });
}
