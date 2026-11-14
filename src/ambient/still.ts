// The ambient screens (#280) are pure drawing: each takes a time t in milliseconds and draws one
// frame into a 400×300 canvas. On a phone and under reduced motion the room draws each screen once,
// at STILL_T, and never again.

export const SCREEN_W = 400;
export const SCREEN_H = 300;

/** The time of the still frame. At it, the git log is at its top (the newest commit first), the
 *  traffic dots are mid-path, and the puzzle shows "SECURE" solved. Each module's own test checks it. */
export const STILL_T = 13400;

/** a mod b that stays in 0..b, whatever the sign of a */
export const wrap = (a: number, b: number) => ((a % b) + b) % b;
