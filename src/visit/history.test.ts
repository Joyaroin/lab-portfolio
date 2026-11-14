import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createShift } from "../shift";
import { createVisit } from "./visit";
import { linkHistory, type HistoryHost } from "./history";
import type { Step } from "../walk";

const page = (station: string, p: string): Step => ({ kind: "page", station, page: p });

function setup(hash = "") {
  const calls: string[] = [];
  let pop: () => void = () => {};
  const host: HistoryHost = {
    history: {
      pushState: (_s, _t, url) => void calls.push(`push ${url}`),
      replaceState: (_s, _t, url) => void calls.push(`replace ${url}`),
    },
    location: { hash },
    // A setter, so the order of the title and the history calls shows in `calls`.
    document: { set title(t: string) { calls.push(`title ${t}`); } } as Document,
    addEventListener: (_t, l) => { pop = l; },
    removeEventListener: () => { pop = () => {}; },
  };
  const visit = createVisit({ reduced: false, now: () => 0 });
  const off = linkHistory(visit, host);
  return { visit, calls, off, host, popstate: (h: string) => { host.location.hash = h; pop(); } };
}

describe("linkHistory", () => {
  it("a move pushes one entry with the station's hash; back pushes the overview", () => {
    const { visit, calls } = setup();
    visit.go(1);
    visit.back();
    expect(calls).toEqual(["push #work", "title Solace · Work · Adham Sedik", "push ./", "title Adham Sedik · Lab"]);
  });
  it("next and a re-target each push", () => {
    const { visit, calls } = setup();
    visit.next();
    visit.go(3);
    expect(calls).toEqual(["push #work", "title Solace · Work · Adham Sedik", "push #about", "title Why I do this · About me · Adham Sedik"]);
  });
  it("a popstate moves the visit, pushes nothing and sets the title", () => {
    const { visit, calls, popstate } = setup();
    popstate("#projects");
    expect(visit.target()).toBe(2);
    popstate("");
    expect(visit.target()).toBe(0);
    expect(calls).toEqual(["title Projects · Adham Sedik", "title Adham Sedik · Lab"]);
  });
  it("a direct link lands there, with an overview entry under it, and no flight", () => {
    const { visit, calls } = setup("#work");
    expect(calls).toEqual(["replace ./", "push #work", "title Solace · Work · Adham Sedik"]);
    expect(visit.where(0)).toEqual({ kind: "at", stop: 1 });
  });
  it("an unknown hash opens the overview and touches no history", () => {
    const { visit, calls } = setup("#nope");
    expect(calls).toEqual([]);
    expect(visit.where(0)).toEqual({ kind: "at", stop: 0 });
  });
  it("a stop move pushes one entry, and a page move replaces it", () => {
    const { visit, calls } = setup();
    visit.go(1);
    visit.next(); // Barracuda: a page move
    visit.next(); // Projects: a stop move
    visit.next(); // Software factory: a page move
    visit.up(); // the list: a page move
    expect(calls).toEqual([
      "push #work", "title Solace · Work · Adham Sedik",
      "replace #work/barracuda", "title Barracuda · Work · Adham Sedik",
      "push #projects", "title Projects · Adham Sedik",
      "replace #projects/software-factory", "title Software factory · Projects · Adham Sedik",
      "replace #projects", "title Projects · Adham Sedik",
    ]);
  });
  it("a page move lands the URL and the title on the page, and Back from there reaches the overview", () => {
    const { visit, calls } = setup();
    visit.go(2);
    visit.next();
    visit.next();
    expect(visit.step()).toEqual(page("projects", "mediasafe"));
    expect(calls.filter((c) => c.startsWith("push"))).toEqual(["push #projects"]);
    expect(calls.at(-2)).toBe("replace #projects/mediasafe");
    expect(calls.at(-1)).toBe("title MediaSafe · Projects · Adham Sedik");
  });
  it("going back to the overview from a page pushes ./", () => {
    const { visit, calls } = setup();
    visit.go(1);
    visit.next();
    visit.back();
    expect(calls.slice(-2)).toEqual(["push ./", "title Adham Sedik · Lab"]);
  });
  it("a popstate to a page hash restores the stop and the page, and pushes and replaces nothing", () => {
    const { visit, calls, popstate } = setup();
    popstate("#projects/home-lab");
    expect(visit.step()).toEqual(page("projects", "home-lab"));
    expect(visit.target()).toBe(2);
    expect(calls).toEqual(["title Home lab · Projects · Adham Sedik"]);
    popstate("#about/contact");
    expect(visit.step()).toEqual(page("about", "contact"));
    expect(calls).toEqual(["title Home lab · Projects · Adham Sedik", "title Contact · About me · Adham Sedik"]);
  });
  it("a direct link to a page lands on it with an overview entry under it, and no flight", () => {
    const { visit, calls } = setup("#projects/mediasafe");
    expect(calls).toEqual(["replace ./", "push #projects/mediasafe", "title MediaSafe · Projects · Adham Sedik"]);
    expect(visit.step()).toEqual(page("projects", "mediasafe"));
    expect(visit.where(0)).toEqual({ kind: "at", stop: 2 });
  });
  it("an old link lands like a direct link to its new place: replace with ./, then push the new hash", () => {
    for (const [old, hash, title, step] of [
      ["#mediasafe", "#projects/mediasafe", "MediaSafe · Projects", page("projects", "mediasafe")],
      ["#home-lab", "#projects/home-lab", "Home lab · Projects", page("projects", "home-lab")],
      ["#software-factory", "#projects/software-factory", "Software factory · Projects", page("projects", "software-factory")],
      ["#contact", "#about/contact", "Contact · About me", page("about", "contact")],
    ] as const) {
      const { visit, calls } = setup(old);
      expect(calls, old).toEqual(["replace ./", `push ${hash}`, `title ${title} · Adham Sedik`]);
      expect(visit.step()).toEqual(step);
      expect(visit.where(0)).toMatchObject({ kind: "at" });
    }
  });
  it("unlinking stops pushing", () => {
    const { visit, calls, off } = setup();
    off();
    visit.go(1);
    expect(calls).toEqual([]);
  });

  describe("under reduced motion, Back during a fade", () => {
    function reducedSetup() {
      const stack = ["./"];
      let i = 0;
      let pop: () => void = () => {};
      let clock = 0;
      const doc = { title: "" } as Document;
      const host: HistoryHost = {
        history: {
          pushState: (_s, _t, url) => { stack.splice(i + 1, stack.length, String(url)); i++; },
          replaceState: (_s, _t, url) => { stack[i] = String(url); },
        },
        location: { get hash() { return stack[i] === "./" ? "" : stack[i]; } } as Location,
        document: doc,
        addEventListener: (_t, l) => { pop = l; },
        removeEventListener: () => {},
      };
      const visit = createVisit({ reduced: true, now: () => clock });
      linkHistory(visit, host);
      return {
        visit, stack, at: (ms: number) => { clock = ms; visit.where(ms); },
        back: () => { i--; pop(); },
        url: () => stack[i],
        title: () => doc.title,
        index: () => i,
      };
    }
    it("a press for the fade's stop keeps the URL on the stop the visitor ends at", () => {
      const s = reducedSetup();
      s.visit.go(1);
      s.at(100);
      s.back();
      expect(s.url()).toBe("./");
      s.at(120);
      s.visit.go(1);
      s.at(400);
      expect(s.visit.target()).toBe(1);
      expect(s.url()).toBe("#work");
      expect(s.title()).toBe("Solace · Work · Adham Sedik");
      s.back();
      expect(s.title()).toBe("Adham Sedik · Lab");
      expect(s.url()).toBe("./");
      expect(s.index()).toBe(0);
    });
    it("a press for another stop ends with the URL on that stop", () => {
      const s = reducedSetup();
      s.visit.go(1);
      s.at(100);
      s.back();
      s.at(120);
      s.visit.go(2);
      s.at(700);
      expect(s.visit.target()).toBe(2);
      expect(s.url()).toBe("#projects");
    });
  });
});

describe("a direct link and the shift", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("plays no shift for the station the page opened on, mounted the way TourView does, and shows its text", () => {
    const { visit } = setup("#work");
    const shift = createShift(false);
    const played = vi.fn();
    shift.subscribe(() => { if (shift.playing) played(shift.playing); });
    shift.setWake(() => {});
    shift.mount({ startWhere: visit.where(performance.now()) });
    shift.powerOnBegan(performance.now());
    shift.observe(visit.where(performance.now()));
    vi.advanceTimersByTime(5000);
    shift.observe(visit.where(performance.now()));
    expect(played).not.toHaveBeenCalled();
    expect(shift.textState(1, performance.now())).toBe("showing");
  });
});
