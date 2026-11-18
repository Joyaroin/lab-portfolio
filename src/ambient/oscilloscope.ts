import { cyclePosition } from "./phase";

// The oscilloscope's screen on the workbench (#381): a waveform scrolling across it. Decoration only, no words.
// The cycle is one scroll by a whole period of the waveform, so it starts over unseen. Its still frame is the waveform at rest.

export const SCOPE_W = 96, SCOPE_H = 72;
/** Milliseconds for the waveform to scroll once across one of its own periods. */
export const SCOPE_CYCLE_MS = 2400;
/** Where in the cycle the still frame is: the waveform at rest, not scrolled at all. */
export const SCOPE_STILL_POS = 0;
/** How many periods of the waveform the screen shows. */
export const SCOPE_PERIODS = 2;

/** The waveform's shape at `u` (in periods; it repeats every 1): a sine, a third harmonic and a little of a seventh, in -1..1. */
export const scopeShape = (u: number) =>
  0.62 * Math.sin(2 * Math.PI * u) + 0.26 * Math.sin(2 * Math.PI * 3 * u + 1) + 0.1 * Math.sin(2 * Math.PI * 7 * u);

/** The trace at time `t`: `n` heights left to right (+1 is the top of the screen, -1 the bottom), the shape scrolled left as the cycle runs. */
export function scopeTrace(t: number, n: number): number[] {
  const scroll = cyclePosition(t, SCOPE_CYCLE_MS, SCOPE_STILL_POS) / SCOPE_CYCLE_MS;
  return Array.from({ length: n }, (_, i) => scopeShape((i / (n - 1)) * SCOPE_PERIODS + scroll));
}

/** Draws frame `t` over the whole canvas: the dark tube, a faint graticule and the trace in the scope's cyan. Opaque. */
export function drawOscilloscope(c: CanvasRenderingContext2D, t: number) {
  const w = SCOPE_W, h = SCOPE_H;
  c.fillStyle = "#02161a"; c.fillRect(0, 0, w, h);
  c.strokeStyle = "rgba(80,190,210,0.22)"; c.lineWidth = 1; c.beginPath();
  for (let i = 1; i < 8; i++) { const x = Math.round((i * w) / 8) + 0.5; c.moveTo(x, 0); c.lineTo(x, h); }
  for (let j = 1; j < 6; j++) { const y = Math.round((j * h) / 6) + 0.5; c.moveTo(0, y); c.lineTo(w, y); }
  c.stroke();
  c.strokeStyle = "#8af0ff"; c.lineWidth = 2.5; c.lineJoin = "round"; c.shadowColor = "#4fdcf5"; c.shadowBlur = 5;
  c.beginPath();
  scopeTrace(t, w).forEach((v, i) => { const y = h / 2 - v * h * 0.4; return i ? c.lineTo(i, y) : c.moveTo(i, y); });
  c.stroke();
}
