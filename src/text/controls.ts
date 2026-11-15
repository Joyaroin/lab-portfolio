// What the controls on a station's glass say and where they go, as a pure function of the page shown (the
// view in ScreenPanels.tsx only draws it): the breadcrumb, the tabs, the Next and Back buttons and the heading.
// Next and Back go where next() and prev() go (src/walk.ts), so a button, the → and ← keys and the meter's keys agree.
import { content as shipped, fill, type Content, type Page, type Station } from "../content";
import { next, prev, stopOf, type Step } from "../walk";

export type PageStep = Extract<Step, { kind: "page" }>;
export type Button = { label: string; to: Step };
export type Controls = {
  /** The first line: "Monitor 1 · Work", or on a project page a link back to the list (`up`) and then `text` (" / mediasafe"). */
  crumb: { text: string; up?: { label: string; to: Step } };
  /** The station's tabs, for a station with several pages and no list (Work, About me); null elsewhere. `sub` is a line under the label. */
  tabs: { page: string; label: string; sub?: string; open: boolean }[] | null;
  next: Button | null;
  back: Button | null;
};

const locate = (s: PageStep, c: Content): { station: Station; page: Page } => {
  const station = c.stations.find((x) => x.id === s.station);
  const page = station?.pages.find((x) => x.id === s.page);
  if (!station || !page) throw new Error(`controls: no such page ${JSON.stringify(s)}`);
  return { station, page };
};

/** A project page: a page of a station that has a list page, other than the list. */
const isProjectPage = (station: Station, page: Page) => !page.list && station.pages.some((p) => p.list);

/** The page's heading: the station's, and a project page's own name. */
export function headingFor(s: PageStep, c: Content = shipped): string {
  const { station, page } = locate(s, c);
  return isProjectPage(station, page) ? page.label : station.heading;
}

export function controlsFor(s: PageStep, c: Content = shipped): Controls {
  const words = c.ui.pageControls;
  const { station, page } = locate(s, c);
  const n = stopOf(s, c);
  const list = station.pages.find((p) => p.list);

  const crumb: Controls["crumb"] = isProjectPage(station, page) && list
    ? { up: { label: words.crumbList, to: { kind: "page", station: station.id, page: list.id } }, text: fill(words.crumbProject, { project: page.id }) }
    : { text: fill(words.crumb, { n, station: station.name }) };

  const tabs = list || station.pages.length < 2 ? null
    : station.pages.map((p) => ({ page: p.id, label: p.label, ...(p.dates ? { sub: p.dates } : {}), open: p.id === page.id }));

  // Next: the list has none (its foot says to pick a project). Otherwise it names the page or station it goes to.
  const to = next(s, c);
  let nextButton: Button | null = null;
  if (!page.list) {
    if (to.kind === "overview") nextButton = { label: words.toOverview, to };
    else {
      const dest = locate(to, c);
      const label = dest.station.id !== station.id ? fill(words.nextMonitor, { station: dest.station.name })
        : station.pageNoun === "job" ? fill(words.nextJob, { company: dest.page.label })
        : station.pageNoun === "project" ? fill(words.nextProject, { name: dest.page.label })
        : fill(words.nextPage, { page: dest.page.label });
      nextButton = { label, to };
    }
  }

  // Back: only to a page of the same station (the first page of a station would leave it).
  const before = prev(s, c);
  const backButton: Button | null = before.kind === "page" && before.station === station.id
    ? { label: fill(words.back, { page: locate(before, c).page.label }), to: before }
    : null;

  return { crumb, tabs, next: nextButton, back: backButton };
}
