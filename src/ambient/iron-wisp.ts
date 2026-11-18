import { cyclePosition } from "./phase";

// The soldering iron's wisp (#381): a thin wisp of smoke that rises from the tip and fades, then a pause. Decoration only.
// Its still frame is no wisp at all: the still position is in the pause, so the canvas is left clear (transparent).

export const WISP_W = 16, WISP_H = 48;
/** One burst and its pause, in milliseconds. */
export const WISP_CYCLE_MS = 6000;
/** Puffs a burst lets off, how far apart they start, and how long each lives. */
export const PUFF_COUNT = 6, PUFF_GAP_MS = 300, PUFF_LIFE_MS = 1800;
/** The burst's length: the last puff dies at its end, and the rest of the cycle is the pause. */
export const BURST_MS = (PUFF_COUNT - 1) * PUFF_GAP_MS + PUFF_LIFE_MS;
/** The still frame: half-way through the pause. */
export const WISP_STILL_POS = (BURST_MS + WISP_CYCLE_MS) / 2;

/** A puff of the wisp: where (x across, y down, both 0..1 of the plane: y 1 is the tip), how big (as a fraction of the plane's width) and how strong. */
export type Puff = { x: number; y: number; r: number; alpha: number };

/** The puffs alive at time `t`. Each starts at the tip (y 1), rises to the top (y 0), sways as it goes, grows, and fades in and out. None in the pause. */
export function wispPuffs(t: number): Puff[] {
  const pos = cyclePosition(t, WISP_CYCLE_MS, WISP_STILL_POS);
  const puffs: Puff[] = [];
  for (let k = 0; k < PUFF_COUNT; k++) {
    const age = (pos - k * PUFF_GAP_MS) / PUFF_LIFE_MS;
    if (age < 0 || age >= 1) continue;
    puffs.push({
      x: 0.5 + 0.3 * age * Math.sin(2 * Math.PI * (1.3 * age + k * 0.37)),
      y: 1 - age,
      r: 0.2 + 0.2 * age,
      alpha: 0.9 * Math.sin(Math.PI * age),
    });
  }
  return puffs;
}

/** Draws frame `t`: clears the canvas (transparent) and draws the puffs, so the still frame is a clear canvas. */
export function drawIronWisp(c: CanvasRenderingContext2D, t: number) {
  c.clearRect(0, 0, WISP_W, WISP_H);
  for (const p of wispPuffs(t)) {
    const x = p.x * WISP_W, y = p.y * WISP_H, r = Math.max(1.2, p.r * WISP_W);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(205,210,215,${p.alpha})`); g.addColorStop(1, "rgba(205,210,215,0)");
    c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
}
