import { STILL_T } from "./still";

// The wall clock's hands (#383): they tick at normal speed from a made-up time, not the visitor's, and about every two to three
// minutes the second hand steps back one second and carries on from there. The face and the twelve ticks are baked; the surface
// is only the hands, on a transparent canvas, in front of the ticks. It draws from `t` alone and carries no live data.
// The still frame is the hands at the made-up time. The canvas changes once a second, so within a second `draw` says "unchanged".

export const CLOCK_W = 72, CLOCK_H = 72;
/** The made-up time the hands show at STILL_T, in seconds after 12: 10:09:25 (the baked clock's old hands were set to the same). */
export const CLOCK_START_S = 10 * 3600 + 9 * 60 + 25;
const DAY_HALF_S = 12 * 3600;
/** The seconds from one slip to the next, in turn and round again: all between two and three minutes. */
export const SLIP_GAPS_S = [140, 165, 125, 175, 150];
const SLIP_CYCLE_S = SLIP_GAPS_S.reduce((a, b) => a + b, 0);

/** The second (counted from STILL_T) the `k`th slip (k from 1) happens at: the hand steps back at that tick. */
export function slipAt(k: number): number {
  const whole = Math.floor((k - 1) / SLIP_GAPS_S.length);
  let s = whole * SLIP_CYCLE_S;
  for (let i = 0; i <= (k - 1) % SLIP_GAPS_S.length; i++) s += SLIP_GAPS_S[i];
  return s;
}

/** How many slips have happened by whole second `n` after STILL_T (a slip at second n counts). */
export function slipsBy(n: number): number {
  let k = Math.floor(n / SLIP_CYCLE_S) * SLIP_GAPS_S.length;
  while (slipAt(k + 1) <= n) k++;
  return k;
}

/** The seconds after 12 the hands show at time `t`: a whole number. The second counter runs from STILL_T (before it, nothing has run yet);
 *  each slip takes the second hand back one second from where the tick before it was, so the clock is then two seconds behind where it was heading. */
export function shownSeconds(t: number): number {
  const n = Math.max(0, Math.floor((t - STILL_T) / 1000));
  const s = CLOCK_START_S + n - 2 * slipsBy(n);
  return ((s % DAY_HALF_S) + DAY_HALF_S) % DAY_HALF_S;
}

/** The hands' angles in degrees clockwise from 12, for `shown` seconds after 12. The minute hand creeps with the seconds, and the hour with the minutes. */
export const handAngles = (shown: number) => ({
  hour: (shown / DAY_HALF_S) * 360,
  minute: ((shown % 3600) / 3600) * 360,
  second: ((shown % 60) / 60) * 360,
});

// The hands' sizes, from the baked ones (tools/room/build.py: lengths 0.095, 0.062 and 0.10 m, widths 0.005, 0.007 and 0.002 m, each tail
// 0.012 m behind the pivot, for a face 0.115 m in radius), scaled to a face of 0.09 m in radius, 36 px on this canvas.
const K = 36 / 0.115;
const HANDS = [
  { key: "hour", length: 0.062, width: 0.007, color: "#111" },
  { key: "minute", length: 0.095, width: 0.005, color: "#111" },
  { key: "second", length: 0.10, width: 0.002, color: "#d02a2a" },
] as const;

/** Paints the hands for `shown` seconds over a cleared (transparent) canvas. */
export function drawHands(c: CanvasRenderingContext2D, shown: number) {
  c.clearRect(0, 0, CLOCK_W, CLOCK_H);
  const angles = handAngles(shown), cx = CLOCK_W / 2, cy = CLOCK_H / 2;
  c.lineCap = "butt";
  for (const h of HANDS) {
    const a = (angles[h.key] * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
    c.strokeStyle = h.color; c.lineWidth = Math.max(1.2, h.width * K);
    c.beginPath(); c.moveTo(cx - dx * 0.012 * K, cy - dy * 0.012 * K); c.lineTo(cx + dx * (h.length - 0.012) * K, cy + dy * (h.length - 0.012) * K); c.stroke();
  }
  c.fillStyle = "#d02a2a"; c.beginPath(); c.arc(cx, cy, 2, 0, Math.PI * 2); c.fill();
}

/** The clock's `draw`: remembers the second it last painted, and returns `false` (nothing painted) while `t` is still within it. */
export function createClock() {
  let painted: number | null = null;
  return (c: CanvasRenderingContext2D, t: number): boolean | void => {
    const shown = shownSeconds(t);
    if (shown === painted) return false;
    painted = shown;
    drawHands(c, shown);
  };
}
