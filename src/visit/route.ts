import { content, fill, identity, ui } from "../content";
import { OVERVIEW, stepAt, type Step } from "../walk";

/** The hash for a step: "" for the overview, `#<station>` for a station's first page and `#<station>/<page>` for a later one. */
export function hashForStep(step: Step): string {
  if (step.kind === "overview") return "";
  const s = content.stations.find((x) => x.id === step.station);
  return s && s.pages[0].id === step.page ? `#${s.id}` : `#${step.station}/${step.page}`;
}

/** Links from before the three monitors: each opens the same content in its new place. */
const OLD_HASHES: Record<string, string> = {
  "#mediasafe": "#projects/mediasafe",
  "#home-lab": "#projects/home-lab",
  "#software-factory": "#projects/software-factory",
  "#contact": "#about/contact",
};

/** The step a URL hash names, old hashes included. Anything unknown is the overview. */
export function stepForHash(hash: string): Step {
  const canonical = OLD_HASHES[hash] ?? hash;
  for (const s of content.stations) {
    for (const p of s.pages) {
      const step: Step = { kind: "page", station: s.id, page: p.id };
      if (hashForStep(step) === canonical) return step;
    }
  }
  return OVERVIEW;
}

/** The stop a URL hash names (1.., or 0 for the overview). */
export const stopForHash = (hash: string): number => {
  const step = stepForHash(hash);
  return step.kind === "overview" ? 0 : content.stations.findIndex((s) => s.id === step.station) + 1;
};

/** The hash for a stop's first page, or "" for the overview. */
export const hashForStop = (stop: number): string => hashForStep(stepAt(stop));

/** The tab title for a step: the page, station and visitor on a named page, the station and visitor on a list page, the page title at the overview. */
export function titleForStep(step: Step): string {
  if (step.kind === "overview") return identity.pageTitle;
  const s = content.stations.find((x) => x.id === step.station);
  const p = s?.pages.find((x) => x.id === step.page);
  if (!s || !p) return identity.pageTitle;
  return p.list ? fill(ui.listTitle, { station: s.name, name: identity.name })
    : fill(ui.stationTitle, { page: p.label, station: s.name, name: identity.name });
}
