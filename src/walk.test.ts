import { describe, it, expect } from "vitest";
import { content, type Content } from "./content";
import { OVERVIEW, next, prev, up, walk, type Step } from "./walk";

const page = (station: string, p: string): Step => ({ kind: "page", station, page: p });
// Every page of the shipped content, in order, written out from the content itself.
const pages = content.stations.flatMap((s) => s.pages.map((p) => page(s.id, p.id)));

/** The shipped content with a second page on the first station that has one page, and the flag on it. */
const withFlag = (): Content => {
  const c = structuredClone(content);
  const s = c.stations[1];
  s.upToFirstPage = true;
  s.pages.push({ ...s.pages[0], id: "second" }, { ...s.pages[0], id: "third" });
  return c;
};

describe("walk order", () => {
  it("→ from the overview reaches every page of every station in order, then the overview", () => {
    const seen: Step[] = [];
    let at = next(OVERVIEW);
    while (at.kind !== "overview") { seen.push(at); at = next(at); }
    expect(seen).toEqual(pages);
    expect(seen).toHaveLength(content.stations.reduce((n, s) => n + s.pages.length, 0));
  });
  it("← is the exact reverse", () => {
    const back: Step[] = [];
    for (let at = pages.at(-1)!; at.kind !== "overview"; at = prev(at)) back.push(at);
    expect(back).toEqual([...pages].reverse());
    expect(prev(pages[0])).toEqual(OVERVIEW);
    const order = walk();
    for (let i = 1; i < order.length; i++) expect(prev(order[i])).toEqual(order[i - 1]);
  });
  it("← at the overview stays put", () => {
    expect(prev(OVERVIEW)).toEqual(OVERVIEW);
  });
  it("walks the pages a station has, not one per station", () => {
    const c = withFlag();
    expect(walk(c)).toHaveLength(walk().length + 2);
    expect(next(page("mediasafe", "mediasafe"), c)).toEqual(page("mediasafe", "second"));
    expect(next(page("mediasafe", "second"), c)).toEqual(page("mediasafe", "third"));
    expect(next(page("mediasafe", "third"), c)).toEqual(page("home-lab", "home-lab"));
    expect(prev(page("home-lab", "home-lab"), c)).toEqual(page("mediasafe", "third"));
  });
  it("refuses a step the content does not have", () => {
    expect(() => next(page("nowhere", "x"))).toThrow(/no such step/);
    expect(() => prev(page("work", "nowhere"))).toThrow(/no such step/);
    expect(() => up(page("nowhere", "x"))).toThrow(/no such step/);
  });
});

describe("going up", () => {
  it("goes to the overview from every page of the shipped content, since no station sets upToFirstPage yet", () => {
    for (const s of content.stations) expect(s.upToFirstPage).toBeUndefined();
    for (const step of pages) expect(up(step)).toEqual(OVERVIEW);
  });
  it("goes from a non-first page to the first page when the station says upToFirstPage", () => {
    const c = withFlag();
    expect(up(page("mediasafe", "second"), c)).toEqual(page("mediasafe", "mediasafe"));
    expect(up(page("mediasafe", "third"), c)).toEqual(page("mediasafe", "mediasafe"));
  });
  it("goes from that station's first page to the overview", () => {
    expect(up(page("mediasafe", "mediasafe"), withFlag())).toEqual(OVERVIEW);
  });
  it("goes to the overview from a station without the flag, even on a later page", () => {
    const c = withFlag();
    c.stations[0].upToFirstPage = false;
    expect(up(page("work", "barracuda"), c)).toEqual(OVERVIEW);
  });
  it("stays at the overview", () => {
    expect(up(OVERVIEW)).toEqual(OVERVIEW);
  });
});
