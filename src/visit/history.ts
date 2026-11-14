import type { Visit } from "./visit";
import { hashForStep, stepForHash, titleForStep } from "./route";
import { sameStep, stopOf, type Step } from "../walk";

/** The parts of `window` the history link uses, so a test can stand in for them. */
export type HistoryHost = {
  history: Pick<History, "pushState" | "replaceState">;
  location: Pick<Location, "hash">;
  document: Pick<Document, "title">;
  addEventListener(type: "popstate", l: () => void): void;
  removeEventListener(type: "popstate", l: () => void): void;
};

const OVERVIEW_URL = "./";

/** Joins the visit to the browser's history. It tracks `shown`, the step (stop and page) the URL shows, updated on every
 *  push, replace and popstate. Whenever the visitor goes or lands at a step the URL does not show, the URL follows: to
 *  another stop (or the overview) it pushes an entry, to another page of the same station it replaces the current one,
 *  so Back goes to the previous monitor or the overview, not through every page. So a HUD link, TV click, meter or Esc
 *  gets one entry, a Back or Forward press (which already moved the URL) gets none, and a press that waited out a fade
 *  and was dropped, or that undid a Back, still ends with the URL on the visitor's step.
 *
 *  Opening a link directly (`/#work`, or an old one like `/#contact`) lands on its step with no flight, and puts an
 *  overview entry under it (replace with ./, then push the hash, the new one for an old link) so Back goes to the overview.
 *
 *  The tab title follows the step the URL shows (`titleForStep`), set after each history call, because a browser
 *  attaches the current title to the current entry: the replace keeps the old title, the push is then titled. Call this before the tour mounts,
 *  so the shift starts from where the visit already is. Returns the unlink. */
export function linkHistory(visit: Visit, host: HistoryHost): () => void {
  let shown = stepForHash(host.location.hash);
  const show = (step: Step) => {
    if (sameStep(step, shown)) return;
    const url = hashForStep(step) || OVERVIEW_URL;
    if (stopOf(step) === stopOf(shown)) host.history.replaceState(null, "", url);
    else host.history.pushState(null, "", url);
    host.document.title = titleForStep(step);
    shown = step;
  };
  if (shown.kind === "page") {
    const start = shown;
    host.history.replaceState(null, "", OVERVIEW_URL);
    host.history.pushState(null, "", hashForStep(start));
    host.document.title = titleForStep(start);
    visit.land(start);
  }
  const off = visit.subscribe((e) => {
    if (e.type === "move" || e.type === "page") show(e.step);
    // Landing with no press waiting (the target is here): the URL must show this step.
    else if (sameStep(visit.step(), e.step)) show(e.step);
  });
  const onPop = () => {
    shown = stepForHash(host.location.hash);
    host.document.title = titleForStep(shown);
    visit.go(shown);
  };
  host.addEventListener("popstate", onPop);
  return () => { off(); host.removeEventListener("popstate", onPop); };
}
