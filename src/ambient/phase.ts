import { STILL_T, wrap } from "./still";

/** Where in its cycle a surface is at time `t` (ms), in 0..cycleMs. The phase rule (ADR 0007): every surface's cycle
 *  shows its still frame at STILL_T, so `cyclePosition(STILL_T, cycleMs, stillPos)` is `stillPos`, the position
 *  in the cycle that holds the still frame (the dark phone's off time, the laptop's last screenful, the rack's steady
 *  lights). A surface reads its cycle through this, never from `t % cycleMs`, so the frame the timer's stop puts back is
 *  one its cycle shows. */
export const cyclePosition = (t: number, cycleMs: number, stillPos: number) => wrap(t - STILL_T + stillPos, cycleMs);
