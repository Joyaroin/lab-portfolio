import { STATION_COUNT } from "../hold";
import { next as stepNext, prev as stepPrev, up as stepUp, OVERVIEW, sameStep, stepAt, stopOf, type Step } from "../walk";
import type { Where } from "../where";

/** A flight's length in ms. A design constant (Adham, 2026-11-08): checked by unit tests only. */
export const FLIGHT_MS = 900;
/** A reduced-motion move's whole fade in ms (out, cut, in). A design constant like FLIGHT_MS. */
export const FADE_MS = 300;

/** Smoothstep: 0 at 0, 1 at 1, slow at both ends. */
export const ease = (t: number) => {
  const u = Math.min(Math.max(t, 0), 1);
  return u * u * (3 - 2 * u);
};

export type VisitEvent =
  /** A move to another stop has started (a landing with no flight is a move too). `from` is where the camera was;
   *  `step` is the stop and page the visitor is going to. */
  | { type: "move"; from: Where; to: number; step: Step }
  /** The visitor is now at `stop`, on `step`'s page. */
  | { type: "land"; stop: number; step: Step }
  /** A move inside a station, to another page of it: no flight, no fade. `stop` is the station's stop. */
  | { type: "page"; stop: number; step: Step };

/** Where a flight began, however many re-targets led to it: a stop, or the camera's real place `f` of the way
 *  along the flight from `from` to stop `to`. A flight's path starts at the pose this describes, found by
 *  following `from` down to a stop (#181's flightPose). */
export type Launch =
  | { kind: "at"; stop: number }
  | { kind: "flying"; from: Launch; to: number; f: number };

/** Where the visitor can be sent: a stop (a station's first page, or the overview), or a step (a stop and page). */
export type Place = number | Step;

export type Visit = {
  /** To a stop's first page, or to a step. Going to the stop the visitor is already at (or flying to) changes nothing. */
  go(place: Place): void;
  /** To the overview (stop 0). */
  back(): void;
  /** One step forward along the walk order (src/walk.ts): the overview goes to Work's first page, a page to the next
   *  page (across stations), the last page to the overview. During a move, the step after its destination. */
  next(): void;
  /** One step back along the walk order, the overview nowhere. During a move, the step before its destination. */
  prev(): void;
  /** Going back up (Esc): a project page to the Projects list, anywhere else to the overview. During a move, from its destination. */
  up(): void;
  /** Puts the visitor at `place` with no flight and no fade. */
  land(place: Place): void;
  /** Where the visitor is at `nowMs`. Also settles a finished move, telling subscribers it landed. */
  where(nowMs: number): Where;
  /** The cover's opacity, 0..1, under reduced motion: 0 when not fading, 1 at the midpoint (the cut). */
  fade(nowMs: number): number;
  /** Whether a move (a flight, or under reduced motion a fade) is running at `nowMs`. Under reduced motion `where()`
   *  reads as at a stop through the whole fade, so this is how to tell a fade from a rest. */
  moving(nowMs: number): boolean;
  /** Where the camera was when the current flight began: a stop, or a chain of the flights it replaced, each
   *  with the share the camera had flown. Null when not flying. #174 flies from `launch(now)` to `target()`. */
  launch(nowMs: number): Launch | null;
  /** The stop the visitor is at or flying to. */
  target(): number;
  /** The stop and page the visitor is at or going to, with any held press applied. */
  step(): Step;
  subscribe(listener: (e: VisitEvent) => void): () => void;
};

type Move = { start: number; launch: Launch; to: number; toStep: Step; origin: number };


const clampStop = (s: number) => Math.min(Math.max(Math.round(s), 0), STATION_COUNT);

/** `now` stamps a move's start; where(nowMs) and fade(nowMs) take the time to read at. */
export function createVisit({ reduced, now = () => performance.now() }: { reduced: boolean; now?: () => number }): Visit {
  let rest: Step = OVERVIEW; // the stop and page the visitor is at when no move is running
  let move: Move | null = null;
  // Reduced motion only: the latest move pressed during a fade, a stop and a page. It starts when that fade ends (Adham, #176).
  let waiting: Step | null = null;
  const listeners = new Set<(e: VisitEvent) => void>();
  const emit = (e: VisitEvent) => [...listeners].forEach((l) => l(e));

  const dur = () => (reduced ? FADE_MS : FLIGHT_MS);
  const step = (): Step => waiting ?? move?.toStep ?? rest;
  const target = () => stopOf(step());

  /** The camera's Where at `t`, without settling. */
  function read(t: number): Where {
    if (!move) return { kind: "at", stop: stopOf(rest) };
    const u = (t - move.start) / dur();
    if (reduced) return { kind: "at", stop: u < 0.5 ? move.origin : move.to };
    const f = ease(u);
    // `from` is the stop nearest the launch; `launch()` has the real start.
    return { kind: "flying", from: move.origin, to: move.to, f };
  }

  function settle(t: number) {
    if (move && t - move.start >= dur()) {
      rest = move.toStep;
      move = null;
      emit({ type: "land", stop: stopOf(rest), step: rest });
      const next = waiting;
      waiting = null;
      // A waiting press for the place just reached is dropped: nothing moves. (history.ts fixes the URL if it differs.)
      // One for another page of the same station is a page move; one for another station is a move.
      if (next !== null && !sameStep(next, rest)) go(next, t);
    }
  }

  function go(place: Place, at?: number) {
    let dest = typeof place === "number" ? stepAt(clampStop(place)) : place;
    const to = stopOf(dest);
    // A stop (not a step) the visitor is at or flying to keeps its page: it is not a page move.
    const here = step(); // reads a held press first: a stop pressed after a page press for that stop keeps the page
    if (typeof place === "number" && to === stopOf(here)) dest = here;
    const t = at ?? now();
    settle(t);
    if (reduced && move) {
      // A fade is running: the press waits for it, and the latest press replaces any earlier one. Nothing is
      // emitted until a move really starts; history.ts keeps the URL right, wherever the waiting presses end.
      waiting = dest;
      return;
    }
    // Where it is (or is going) already: nothing. Another page of the same station: the page changes with no move, now.
    if (to === target()) {
      if (!sameStep(dest, step())) {
        if (move) move.toStep = dest; else rest = dest;
        emit({ type: "page", stop: to, step: dest });
      }
      return;
    }
    const from = read(t);
    const origin = from.kind === "at" ? from.stop : from.f < 0.5 ? from.from : from.to;
    const launch: Launch = move
      ? { kind: "flying", from: move.launch, to: move.to, f: ease((t - move.start) / dur()) }
      : { kind: "at", stop: stopOf(rest) };
    move = { start: t, launch, to, toStep: dest, origin };
    emit({ type: "move", from, to, step: dest });
  }

  return {
    go,
    back: () => go(0),
    next() {
      settle(now());
      go(stepNext(step()));
    },
    prev() {
      settle(now());
      go(stepPrev(step()));
    },
    up() {
      settle(now());
      go(stepUp(step()));
    },
    land(place) {
      const dest = typeof place === "number" ? stepAt(clampStop(place)) : place;
      const to = stopOf(dest);
      const from = read(now());
      settle(now());
      move = null;
      waiting = null;
      rest = dest;
      emit({ type: "move", from, to, step: dest });
      emit({ type: "land", stop: to, step: dest });
    },
    where(nowMs) {
      settle(nowMs);
      return read(nowMs);
    },
    fade(nowMs) {
      settle(nowMs);
      if (!reduced || !move) return 0;
      const u = Math.min(Math.max((nowMs - move.start) / FADE_MS, 0), 1);
      return 1 - Math.abs(2 * u - 1);
    },
    moving(nowMs) {
      settle(nowMs);
      return move !== null;
    },
    launch(nowMs) {
      settle(nowMs);
      return move && !reduced ? move.launch : null;
    },
    target,
    step,
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}
