// The walk order: the tour as one sequence of steps, as a pure function of the content. The overview
// comes first, then every page of every station in order. `next` and `prev` move one step along it
// (→ and ←), and `up` goes back up (Esc). Nothing calls this module yet; the visit will.
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
