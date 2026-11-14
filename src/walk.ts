// The walk order: the tour as one sequence of steps, as a pure function of the content. The overview
// comes first, then every page of every station in order. `next` and `prev` move one step along it
// (→ and ←), and `up` goes back up (Esc). The visit holds a `Step` and moves it with these.
import { content as shipped, type Content } from "./content";

/** Where the visitor is: the overview, or one page of one station (both by id). */
export type Step = { kind: "overview" } | { kind: "page"; station: string; page: string };

export const OVERVIEW: Step = { kind: "overview" };

/** The overview, then every page of every station, in order. */
export function walk(c: Content = shipped): Step[] {
  return [OVERVIEW, ...c.stations.flatMap((s) => s.pages.map((p): Step => ({ kind: "page", station: s.id, page: p.id })))];
}

const indexOf = (order: Step[], step: Step) => {
  const i = order.findIndex((o) => o.kind === step.kind && (o.kind === "overview" || (step.kind === "page" && o.station === step.station && o.page === step.page)));
  if (i < 0) throw new Error(`walk: no such step ${JSON.stringify(step)}`);
  return i;
};

/** One step forward. After the last page it wraps to the overview. */
export function next(step: Step, c: Content = shipped): Step {
  const order = walk(c);
  return order[(indexOf(order, step) + 1) % order.length];
}

/** One step back, the exact reverse of `next`. At the overview it stays put. */
export function prev(step: Step, c: Content = shipped): Step {
  const order = walk(c);
  return order[Math.max(0, indexOf(order, step) - 1)];
}

/** Going back up: from a later page of a station that has `upToFirstPage`, to its first page; from anywhere else, to the overview. */
export function up(step: Step, c: Content = shipped): Step {
  if (step.kind === "overview") return OVERVIEW;
  const s = c.stations.find((x) => x.id === step.station);
  if (!s) throw new Error(`walk: no such step ${JSON.stringify(step)}`);
  if (s.upToFirstPage && s.pages[0].id !== step.page) return { kind: "page", station: s.id, page: s.pages[0].id };
  return OVERVIEW;
}

/** Whether two steps are the same place. */
export const sameStep = (a: Step, b: Step) =>
  a.kind === "overview" ? b.kind === "overview" : b.kind === "page" && a.station === b.station && a.page === b.page;

/** The stop a step is at: 0 for the overview, 1.. for a station (its place in the content). */
export function stopOf(step: Step, c: Content = shipped): number {
  if (step.kind === "overview") return 0;
  const i = c.stations.findIndex((s) => s.id === step.station);
  if (i < 0) throw new Error(`walk: no such step ${JSON.stringify(step)}`);
  return i + 1;
}

/** The step a stop opens on: the overview, or the first page of the station. A stop out of range is clamped. */
export function stepAt(stop: number, c: Content = shipped): Step {
  const i = Math.min(Math.max(Math.round(stop), 0), c.stations.length);
  return i === 0 ? OVERVIEW : { kind: "page", station: c.stations[i - 1].id, page: c.stations[i - 1].pages[0].id };
}
