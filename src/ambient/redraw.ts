import type { Where } from "../where";

// When the ambient screens (#280) redraw: only at the landscape overview, with no flight and without
// reduced motion, at about 12 frames a second. Anywhere else they hold their still frame and nothing
// runs (ADR 0007). `ambientRedraws` is the rule; `createAmbientRedraw` is the one timer it starts and stops.

/** Milliseconds between redraws: about 12 a second. */
export const REDRAW_MS = 83;

export type RedrawState = {
  where: Where;
  /** The framing's name: "square" is the landscape window (src/framing). */
  framing: "square" | "portrait";
  reduced: boolean;
};

/** Whether the screens redraw now. */
export const ambientRedraws = ({ where, framing, reduced }: RedrawState) =>
  where.kind === "at" && where.stop === 0 && framing === "square" && !reduced;

/** One timer that calls `tick` every REDRAW_MS while `sync` is told the screens should redraw, and none otherwise. */
export function createAmbientRedraw(tick: () => void) {
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => { if (timer !== null) { clearInterval(timer); timer = null; } };
  return {
    /** Starts or stops the timer for `state`. Safe to call as often as you like. */
    sync(state: RedrawState) {
      if (!ambientRedraws(state)) return stop();
      timer ??= setInterval(tick, REDRAW_MS);
    },
    stop,
    running: () => timer !== null,
  };
}
