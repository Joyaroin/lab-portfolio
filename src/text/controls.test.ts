import { describe, it, expect } from "vitest";
import { content } from "../content";
import { next, prev, walk } from "../walk";
import { controlsFor, headingFor, type PageStep } from "./controls";

const page = (station: string, id: string): PageStep => ({ kind: "page", station, page: id });
const ctl = (station: string, id: string) => controlsFor(page(station, id));

describe("the breadcrumb", () => {
  it("opens every station's first page with its monitor and name", () => {
    expect(ctl("work", "solace").crumb).toEqual({ text: "Monitor 1 · Work" });
    expect(ctl("projects", "list").crumb).toEqual({ text: "Monitor 2 · Projects" });
    expect(ctl("about", "why-i-do-this").crumb).toEqual({ text: "Monitor 3 · About me" });
  });
  it("is the same on a station's later list pages (tabs)", () => {
    expect(ctl("work", "barracuda").crumb).toEqual({ text: "Monitor 1 · Work" });
    expect(ctl("about", "contact").crumb).toEqual({ text: "Monitor 3 · About me" });
  });
  it("on a project page links ~/projects back to the list, then names the project", () => {
    for (const id of ["software-factory", "mediasafe", "home-lab"]) {
      expect(ctl("projects", id).crumb).toEqual({ up: { label: "~/projects", to: page("projects", "list") }, text: ` / ${id}` });
    }
  });
});

describe("tabs and the list", () => {
  it("Work and About me show tabs, in page order, with the open one marked", () => {
    expect(ctl("work", "barracuda").tabs).toEqual([
      { page: "solace", label: "Solace", sub: "Sep to Dec 2026", open: false },
      { page: "barracuda", label: "Barracuda", sub: "Sep 2025 to Aug 2026", open: true },
    ]);
    expect(ctl("about", "contact").tabs?.map((t) => [t.label, t.open])).toEqual([["Why I do this", false], ["Off the keyboard", false], ["Contact", true]]);
  });
  it("Projects has no tabs: a list, and project pages that go back to it", () => {
    for (const p of content.stations[1].pages) expect(ctl("projects", p.id).tabs).toBeNull();
  });
});

describe("the heading", () => {
  it("is the station's, except on a project page, which is headed by the project", () => {
    expect(headingFor(page("work", "solace"))).toBe("Work experience");
    expect(headingFor(page("projects", "list"))).toBe("Things I've built and run");
    expect(headingFor(page("projects", "mediasafe"))).toBe("MediaSafe");
    expect(headingFor(page("about", "contact"))).toBe("Hi, I'm Adham.");
  });
});

describe("Next", () => {
  it("names where it goes, on every page", () => {
    const next_ = (s: string, p: string) => ctl(s, p).next?.label ?? null;
    expect(next_("work", "solace")).toBe("Next job: Barracuda →");
    expect(next_("work", "barracuda")).toBe("Next: Projects →");
    expect(next_("projects", "list")).toBeNull(); // the list's own foot says what to do
    expect(next_("projects", "software-factory")).toBe("Next project: MediaSafe →");
    expect(next_("projects", "mediasafe")).toBe("Next project: Home lab →");
    expect(next_("projects", "home-lab")).toBe("Next: About me →");
    expect(next_("about", "why-i-do-this")).toBe("Next: Off the keyboard →");
    expect(next_("about", "off-the-keyboard")).toBe("Next: Contact →");
    expect(next_("about", "contact")).toBe("Back to overview");
  });
  it("goes where next() goes, so the button and the → key agree", () => {
    for (const s of walk()) if (s.kind === "page") {
      const c = controlsFor(s);
      if (c.next) expect(c.next.to).toEqual(next(s));
    }
  });
});

describe("Back", () => {
  it("names the page before, inside a station", () => {
    const back = (s: string, p: string) => ctl(s, p).back?.label ?? null;
    expect(back("work", "solace")).toBeNull();
    expect(back("work", "barracuda")).toBe("← Solace");
    expect(back("projects", "list")).toBeNull();
    expect(back("projects", "software-factory")).toBe("← All projects");
    expect(back("projects", "mediasafe")).toBe("← Software factory");
    expect(back("projects", "home-lab")).toBe("← MediaSafe");
    expect(back("about", "why-i-do-this")).toBeNull();
    expect(back("about", "off-the-keyboard")).toBe("← Why I do this");
    expect(back("about", "contact")).toBe("← Off the keyboard");
  });
  it("goes where prev() goes, so the button and the ← key agree", () => {
    for (const s of walk()) if (s.kind === "page") {
      const c = controlsFor(s);
      if (c.back) expect(c.back.to).toEqual(prev(s));
    }
  });
});
