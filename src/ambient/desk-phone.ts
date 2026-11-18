import { cyclePosition } from "./phase";

// The desk phone's display (#383): about once a minute the screen lights for a few seconds with an envelope icon, and no words.
// The rest of the time it is dark: the canvas is left clear (transparent) and the baked, dark display shows through, so a dark
// frame costs nothing: `createDeskPhone`'s draw says "unchanged" and the room skips the upload. The still frame is dark.

export const PHONE_W = 112, PHONE_H = 52;
/** One light-up and the dark time after it, in milliseconds: about once a minute. */
export const PHONE_CYCLE_MS = 60_000;
/** Where in the cycle the light comes on, and how long it stays on (ramps included). */
export const PHONE_LIT_AT = 40_000, PHONE_LIT_MS = 4_000;
/** The time the screen takes to come up to full light, and to fade out again. */
export const PHONE_RAMP_MS = 250;
/** The still frame's place in the cycle: dark, half-way through the dark time before the light. */
export const PHONE_STILL_POS = 20_000;
/** The levels the glow is drawn at, 0 (dark) to this: two frames at the same level are the same frame. */
export const GLOW_STEPS = 8;

/** How lit the screen is at time `t`: 0 (dark) to 1 (full). */
export function phoneGlow(t: number): number {
  const into = cyclePosition(t, PHONE_CYCLE_MS, PHONE_STILL_POS) - PHONE_LIT_AT;
  if (into < 0 || into >= PHONE_LIT_MS) return 0;
  return Math.min(1, into / PHONE_RAMP_MS, (PHONE_LIT_MS - into) / PHONE_RAMP_MS);
}

/** The frame the canvas holds at `t`: its glow level, 0 to GLOW_STEPS. 0 is the dark frame. */
export const phoneLevel = (t: number) => Math.round(phoneGlow(t) * GLOW_STEPS);

/** Paints the frame at glow `level` over the whole canvas: clear when dark, otherwise a backlit screen with an envelope on it. */
export function drawPhoneFrame(c: CanvasRenderingContext2D, level: number) {
  c.clearRect(0, 0, PHONE_W, PHONE_H);
  if (level <= 0) return;
  c.globalAlpha = level / GLOW_STEPS;
  c.fillStyle = "#a9e6c4"; c.fillRect(0, 0, PHONE_W, PHONE_H);
  // the envelope: a body, and the flap's V
  const w = 40, h = 26, x = (PHONE_W - w) / 2, y = (PHONE_H - h) / 2;
  c.strokeStyle = "#0e2a1c"; c.lineWidth = 3; c.lineJoin = "round"; c.lineCap = "round";
  c.strokeRect(x, y, w, h);
  c.beginPath(); c.moveTo(x, y); c.lineTo(PHONE_W / 2, y + h * 0.58); c.lineTo(x + w, y); c.stroke();
  c.globalAlpha = 1;
}

/** The display's `draw`: remembers the level it last painted, and returns `false` (nothing painted) when the frame asked for is that one. */
export function createDeskPhone() {
  let painted: number | null = null;
  return (c: CanvasRenderingContext2D, t: number): boolean | void => {
    const level = phoneLevel(t);
    if (level === painted) return false;
    painted = level;
    drawPhoneFrame(c, level);
  };
}
