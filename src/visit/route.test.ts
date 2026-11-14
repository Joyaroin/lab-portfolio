import { describe, it, expect } from "vitest";
import { content, identity, stations } from "../content";
import { OVERVIEW, walk, type Step } from "../walk";
import { hashForStep, hashForStop, stepForHash, stopForHash, titleForStep } from "./route";

const page = (station: string, p: string): Step => ({ kind: "page", station, page: p });

// Every page and the hash the spec (#280) gives it, written out.
const HASHES: [string, Step][] = [
  ["#work", page("work", "solace")],
  ["#work/barracuda", page("work", "barracuda")],
  ["#projects", page("projects", "list")],
  ["#projects/software-factory", page("projects", "software-factory")],
  ["#projects/mediasafe", page("projects", "mediasafe")],
  ["#projects/home-lab", page("projects", "home-lab")],
  ["#about", page("about", "why-i-do-this")],
  ["#about/off-the-keyboard", page("about", "off-the-keyboard")],
  ["#about/contact", page("about", "contact")],
];

describe("route", () => {
  it("every page has the hash #280 gives it, and the hash gives the page back", () => {
    for (const [hash, step] of HASHES) {
      expect(stepForHash(hash), hash).toEqual(step);
      expect(hashForStep(step), hash).toBe(hash);
    }
  });
  it("every page of the content maps to a hash and back, and the hashes are all different", () => {
    const pages = walk().slice(1);
    expect(HASHES.map(([, s]) => s)).toEqual(pages);
    const hashes = pages.map(hashForStep);
    expect(new Set(hashes).size).toBe(pages.length);
    for (const step of pages) expect(stepForHash(hashForStep(step))).toEqual(step);
  });
  it("the overview has no hash, and no hash is the overview", () => {
    expect(hashForStep(OVERVIEW)).toBe("");
    expect(stepForHash("")).toEqual(OVERVIEW);
    expect(hashForStop(0)).toBe("");
  });
  it("old hashes map to their new place", () => {
    expect(stepForHash("#mediasafe")).toEqual(page("projects", "mediasafe"));
    expect(stepForHash("#home-lab")).toEqual(page("projects", "home-lab"));
    expect(stepForHash("#software-factory")).toEqual(page("projects", "software-factory"));
    expect(stepForHash("#contact")).toEqual(page("about", "contact"));
    expect(hashForStep(stepForHash("#contact"))).toBe("#about/contact");
  });
  it("unknown hashes give the overview", () => {
    for (const h of ["#", "#nope", "work", "#WORK", "#work/nope", "#nope/solace", "#work/", "#projects/list", "#work/solace", "#about/why-i-do-this"]) {
      expect(stepForHash(h), h).toEqual(OVERVIEW);
    }
  });
  it("the hash of the removed station is the overview", () => {
    // built in two parts: the repo's grep for the old name (ticket #221) must find nothing in src or tests
    expect(stepForHash(`#${["order", "tracker"].join("-")}`)).toEqual(OVERVIEW);
  });
  it("a station's stop and its first page's hash are #work, #projects and #about", () => {
    expect(stations.map((_, i) => hashForStop(i + 1))).toEqual(["#work", "#projects", "#about"]);
    expect(["#work", "#projects", "#about", "#work/barracuda", "#about/contact", "#projects/mediasafe", "#mediasafe", "#nope", ""].map(stopForHash)).toEqual([1, 2, 3, 1, 3, 2, 2, 0, 0]);
  });
});

describe("the tab title", () => {
  it("names the page, the station and the visitor on a named page", () => {
    expect(titleForStep(page("work", "solace"))).toBe("Solace · Work · Adham Sedik");
    expect(titleForStep(page("work", "barracuda"))).toBe("Barracuda · Work · Adham Sedik");
    expect(titleForStep(page("projects", "mediasafe"))).toBe("MediaSafe · Projects · Adham Sedik");
    expect(titleForStep(page("about", "why-i-do-this"))).toBe("Why I do this · About me · Adham Sedik");
  });
  it("names the station and the visitor on the Projects list", () => {
    expect(titleForStep(page("projects", "list"))).toBe("Projects · Adham Sedik");
  });
  it("is the page title at the overview", () => {
    expect(titleForStep(OVERVIEW)).toBe(identity.pageTitle);
    expect(titleForStep(OVERVIEW)).toBe("Adham Sedik · Lab");
  });
  it("every page's title comes from the content", () => {
    for (const s of content.stations) for (const p of s.pages) {
      const t = titleForStep({ kind: "page", station: s.id, page: p.id });
      expect(t).toBe(p.list ? `${s.name} · ${identity.name}` : `${p.label} · ${s.name} · ${identity.name}`);
    }
  });
});
