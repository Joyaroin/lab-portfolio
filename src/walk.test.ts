import { describe, it, expect } from "vitest";
import { content, type Content } from "./content";
import { OVERVIEW, next, prev, sameStep, stepAt, stopOf, up, walk, type Step } from "./walk";

const page = (station: string, p: string): Step => ({ kind: "page", station, page: p });
// Every page of the shipped content, in order, written out from the content itself.
const pages = content.stations.flatMap((s) => s.pages.map((p) => page(s.id, p.id)));

/** The shipped content with the flag on Work (Projects, the one station that has it, loses it) and two more pages on Work. */
const withFlag = (): Content => {
  const c = structuredClone(content);
  c.stations[1].upToFirstPage = undefined;
  const s = c.stations[0];
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
    expect(next(page("work", "barracuda"), c)).toEqual(page("work", "second"));
    expect(next(page("work", "second"), c)).toEqual(page("work", "third"));
    expect(next(page("work", "third"), c)).toEqual(page("projects", "list"));
    expect(prev(page("projects", "list"), c)).toEqual(page("work", "third"));
  });
  it("refuses a step the content does not have", () => {
    expect(() => next(page("nowhere", "x"))).toThrow(/no such step/);
    expect(() => prev(page("work", "nowhere"))).toThrow(/no such step/);
    expect(() => up(page("nowhere", "x"))).toThrow(/no such step/);
  });
});

describe("going up", () => {
  it("goes to the overview from every page of the shipped content, except a project page, which goes to the Projects list", () => {
    expect(content.stations.filter((s) => s.upToFirstPage).map((s) => s.id)).toEqual(["projects"]);
    for (const step of pages) {
      const project = step.kind === "page" && step.station === "projects" && step.page !== "list";
      expect(up(step), JSON.stringify(step)).toEqual(project ? page("projects", "list") : OVERVIEW);
    }
  });
  it("goes from a non-first page to the first page when the station says upToFirstPage", () => {
    const c = withFlag();
    expect(up(page("work", "second"), c)).toEqual(page("work", "solace"));
    expect(up(page("work", "third"), c)).toEqual(page("work", "solace"));
  });
  it("goes from that station's first page to the overview", () => {
    expect(up(page("work", "solace"), withFlag())).toEqual(OVERVIEW);
  });
  it("goes to the overview from a station without the flag, even on a later page", () => {
    const c = withFlag();
    c.stations[0].upToFirstPage = false;
    expect(up(page("work", "barracuda"), c)).toEqual(OVERVIEW);
    expect(up(page("about", "contact"), c)).toEqual(OVERVIEW);
  });
  it("stays at the overview", () => {
    expect(up(OVERVIEW)).toEqual(OVERVIEW);
  });
});

describe("stops and steps", () => {
  it("a step's stop is its station's place in the content, 0 for the overview", () => {
    expect(stopOf(OVERVIEW)).toBe(0);
    expect(stopOf(page("work", "barracuda"))).toBe(1);
    expect(stopOf(page("projects", "mediasafe"))).toBe(2);
    expect(stopOf(page("about", "contact"))).toBe(3);
    expect(() => stopOf(page("nowhere", "x"))).toThrow(/no such step/);
  });
  it("a stop opens on its first page, and the overview on the overview", () => {
    expect(stepAt(0)).toEqual(OVERVIEW);
    expect(stepAt(1)).toEqual(page("work", "solace"));
    expect(stepAt(2)).toEqual(page("projects", "list"));
    expect(stepAt(3)).toEqual(page("about", "why-i-do-this"));
    expect(stepAt(9)).toEqual(stepAt(3));
    expect(stepAt(-1)).toEqual(OVERVIEW);
  });
  it("two steps are the same only on the same station and page", () => {
    expect(sameStep(OVERVIEW, OVERVIEW)).toBe(true);
    expect(sameStep(OVERVIEW, page("work", "solace"))).toBe(false);
    expect(sameStep(page("work", "solace"), page("work", "solace"))).toBe(true);
    expect(sameStep(page("work", "solace"), page("work", "barracuda"))).toBe(false);
  });
});
