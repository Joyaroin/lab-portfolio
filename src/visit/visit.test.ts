import { describe, it, expect } from "vitest";
import { STATION_COUNT } from "../hold";
import { createVisit, ease, FADE_MS, FLIGHT_MS, type VisitEvent } from "./index";
import { OVERVIEW, walk, type Step } from "../walk";

const page = (station: string, p: string): Step => ({ kind: "page", station, page: p });
const SOLACE = page("work", "solace"), BARRACUDA = page("work", "barracuda"), LIST = page("projects", "list");
const SOFTWARE_FACTORY = page("projects", "software-factory"), MEDIASAFE = page("projects", "mediasafe"), HOME_LAB = page("projects", "home-lab");
const WHY = page("about", "why-i-do-this"), CONTACT = page("about", "contact");
const LAST_PAGE = walk().at(-1)!;

function setup(reduced = false) {
  let t = 1000;
  const visit = createVisit({ reduced, now: () => t });
  const events: VisitEvent[] = [];
  visit.subscribe((e) => events.push(e));
  return { visit, events, at: (ms: number) => (t = ms), advance: (ms: number) => (t += ms), now: () => t };
}

describe("go, back, land", () => {
  it("starts at the overview", () => {
    expect(setup().visit.where(0)).toEqual({ kind: "at", stop: 0 });
  });

  it("flies to a stop and rests there", () => {
    const { visit, advance, now } = setup();
    visit.go(3);
    expect(visit.where(now())).toEqual({ kind: "flying", from: 0, to: 3, f: 0 });
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 3 });
  });

  it("back flies to the overview", () => {
    const { visit, advance, now } = setup();
    visit.land(2);
    visit.back();
    expect(visit.where(now())).toEqual({ kind: "flying", from: 2, to: 0, f: 0 });
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 0 });
  });

  it("land puts the visitor at the stop with no flight", () => {
    const { visit, now } = setup();
    visit.land(3);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 3 });
  });

  it("going to where you already are does nothing", () => {
    const { visit, events } = setup();
    visit.go(0);
    visit.go(2);
    visit.go(2);
    expect(events.filter((e) => e.type === "move")).toHaveLength(1);
  });
});

describe("a flight", () => {
  it("runs f from 0 to 1, rising, and ends exactly at the stop", () => {
    const { visit, at } = setup();
    visit.go(2);
    let last = -1;
    for (let ms = 0; ms < FLIGHT_MS; ms += 50) {
      const w = visit.where(at(1000 + ms));
      if (w.kind !== "flying") throw new Error("not flying");
      expect(w.f).toBeGreaterThanOrEqual(last);
      last = w.f;
    }
    expect(last).toBeGreaterThan(0.9);
    expect(visit.where(at(1000 + FLIGHT_MS))).toEqual({ kind: "at", stop: 2 });
  });

  it("is eased: slower than linear at the start, and half done at half the time", () => {
    const { visit, at } = setup();
    visit.go(2);
    const early = visit.where(at(1000 + FLIGHT_MS * 0.1));
    expect(early).toMatchObject({ kind: "flying" });
    if (early.kind === "flying") expect(early.f).toBeLessThan(0.1);
    const mid = visit.where(at(1000 + FLIGHT_MS / 2));
    if (mid.kind === "flying") expect(mid.f).toBeCloseTo(0.5);
  });

  it("is 0.9 s", () => {
    expect(FLIGHT_MS).toBe(900);
  });
});

describe("next", () => {
  it("walks every page in order, across the stations, and ends at the overview", () => {
    const { visit, advance, now } = setup();
    const seen: Step[] = [];
    for (let i = 1; i < walk().length; i++) {
      visit.next();
      seen.push(visit.step());
      advance(FLIGHT_MS);
      visit.where(now());
    }
    expect(seen).toEqual(walk().slice(1));
    visit.next();
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 0 });
    expect(visit.step()).toEqual(OVERVIEW);
  });

  it("from the first page of Work goes to Barracuda: a page move, with no flight", () => {
    const { visit, events, now } = setup();
    visit.land(1);
    events.length = 0;
    visit.next();
    expect(visit.step()).toEqual(BARRACUDA);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 1 });
    expect(visit.moving(now())).toBe(false);
    expect(events).toEqual([{ type: "page", stop: 1, step: BARRACUDA }]);
  });

  it("from a station's last page flies to the next station's first page", () => {
    const { visit, advance, now } = setup();
    visit.land(BARRACUDA);
    visit.next();
    expect(visit.where(now())).toMatchObject({ kind: "flying", from: 1, to: 2 });
    expect(visit.step()).toEqual(LIST);
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 });
  });

  it("from the last page of the last station goes to the overview", () => {
    const { visit, advance, now } = setup();
    visit.land(LAST_PAGE);
    visit.next();
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 0 });
  });

  it("during a flight means the step after its destination", () => {
    const { visit, advance, now } = setup();
    visit.go(2);
    advance(300);
    visit.next();
    expect(visit.step()).toEqual(SOFTWARE_FACTORY);
    expect(visit.target()).toBe(2);
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 });
    expect(visit.step()).toEqual(SOFTWARE_FACTORY);
  });

  it("during a flight to the last page wraps to the overview", () => {
    const { visit, advance } = setup();
    visit.go(LAST_PAGE);
    advance(300);
    visit.next();
    expect(visit.target()).toBe(0);
  });
});

describe("prev", () => {
  it("walks back the exact reverse of next, to the overview", () => {
    const { visit, advance, now } = setup();
    visit.land(LAST_PAGE);
    const seen: Step[] = [];
    for (let i = 1; i < walk().length; i++) {
      visit.prev();
      seen.push(visit.step());
      advance(FLIGHT_MS);
      visit.where(now());
    }
    expect(seen).toEqual([...walk()].reverse().slice(1));
  });

  it("from a station's later page goes to the page before, a page move", () => {
    const { visit, events } = setup();
    visit.land(BARRACUDA);
    events.length = 0;
    visit.prev();
    expect(visit.step()).toEqual(SOLACE);
    expect(events).toEqual([{ type: "page", stop: 1, step: SOLACE }]);
  });

  it("from a station's first page goes to the last page of the station before", () => {
    const { visit, advance, now } = setup();
    visit.land(WHY);
    visit.prev();
    expect(visit.step()).toEqual(HOME_LAB);
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 });
  });

  it("from the first page of Work goes to the overview", () => {
    const { visit, advance, now } = setup();
    visit.land(1);
    visit.prev();
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 0 });
  });

  it("does nothing at the overview", () => {
    const { visit, events, advance, now } = setup();
    visit.prev();
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 0 });
    expect(events).toEqual([]);
  });

  it("during a flight means the step before its destination", () => {
    const { visit, advance, now } = setup();
    visit.go(WHY);
    advance(300);
    visit.prev();
    expect(visit.step()).toEqual(HOME_LAB);
    expect(visit.target()).toBe(2);
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 });
  });

  it("during a flight to the first page of Work means the overview, and during one to the overview nothing", () => {
    const { visit, advance } = setup();
    visit.go(1);
    advance(300);
    visit.prev();
    expect(visit.target()).toBe(0);
    visit.prev();
    expect(visit.target()).toBe(0);
  });

  it("during a fade means the step before its destination", () => {
    const { visit } = setup(true);
    visit.go(WHY);
    visit.prev();
    expect(visit.step()).toEqual(HOME_LAB);
  });
});

describe("up (Esc)", () => {
  it("from a project page goes to the Projects list, a page move", () => {
    const { visit, events, now } = setup();
    visit.land(MEDIASAFE);
    events.length = 0;
    visit.up();
    expect(visit.step()).toEqual(LIST);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 });
    expect(events).toEqual([{ type: "page", stop: 2, step: LIST }]);
  });

  it("from anywhere else goes to the overview", () => {
    for (const step of [SOLACE, BARRACUDA, LIST, WHY, CONTACT]) {
      const { visit, advance, now } = setup();
      visit.land(step);
      visit.up();
      advance(FLIGHT_MS);
      expect(visit.where(now()), JSON.stringify(step)).toEqual({ kind: "at", stop: 0 });
    }
  });

  it("does nothing at the overview", () => {
    const { visit, events } = setup();
    visit.up();
    expect(events).toEqual([]);
  });

  it("during a flight to a project page means the list", () => {
    const { visit, advance } = setup();
    visit.go(MEDIASAFE);
    advance(300);
    visit.up();
    expect(visit.step()).toEqual(LIST);
    expect(visit.target()).toBe(2);
  });
});

describe("a stop and a page", () => {
  it("go(stop) opens a station's first page, and back() the overview", () => {
    const { visit } = setup();
    visit.go(3);
    expect(visit.step()).toEqual(WHY);
    visit.back();
    expect(visit.step()).toEqual(OVERVIEW);
  });

  it("go(step) flies to that page's station, and rests on that page", () => {
    const { visit, advance, now, events } = setup();
    visit.go(CONTACT);
    expect(events).toEqual([{ type: "move", from: { kind: "at", stop: 0 }, to: 3, step: CONTACT }]);
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 3 });
    expect(visit.step()).toEqual(CONTACT);
    expect(events[1]).toEqual({ type: "land", stop: 3, step: CONTACT });
  });

  it("land(step) puts the visitor on that page with no flight", () => {
    const { visit, now } = setup();
    visit.land(MEDIASAFE);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 });
    expect(visit.step()).toEqual(MEDIASAFE);
  });

  it("going to the stop the visitor is on keeps the page", () => {
    const { visit, events } = setup();
    visit.land(BARRACUDA);
    events.length = 0;
    visit.go(1);
    expect(visit.step()).toEqual(BARRACUDA);
    expect(events).toEqual([]);
  });

  it("go(step) to another page of the same station moves the page and nothing else", () => {
    const { visit, events, now } = setup();
    visit.land(1);
    events.length = 0;
    visit.go(BARRACUDA);
    expect(visit.step()).toEqual(BARRACUDA);
    expect(visit.moving(now())).toBe(false);
    expect(events.map((e) => e.type)).toEqual(["page"]);
  });

  it("a page move during a flight to its station changes the page it lands on, and the flight goes on", () => {
    const { visit, advance, now, events } = setup();
    visit.go(1);
    advance(300);
    events.length = 0;
    visit.next();
    expect(events).toEqual([{ type: "page", stop: 1, step: BARRACUDA }]);
    expect(visit.where(now())).toMatchObject({ kind: "flying", to: 1 });
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 1 });
    expect(visit.step()).toEqual(BARRACUDA);
    expect(events[1]).toEqual({ type: "land", stop: 1, step: BARRACUDA });
  });
});

describe("a go mid-flight", () => {
  it("starts a new flight from where the camera is, with f back at 0", () => {
    const { visit, advance, now } = setup();
    visit.go(1);
    advance(FLIGHT_MS / 2);
    const before = visit.where(now());
    visit.go(3);
    expect(visit.where(now())).toMatchObject({ kind: "flying", to: 3, f: 0 });
    expect(visit.launch(now())).toEqual({ kind: "flying", from: { kind: "at", stop: 0 }, to: 1, f: before.kind === "flying" ? before.f : -1 });
    advance(FLIGHT_MS / 2);
    expect(visit.where(now())).toMatchObject({ kind: "flying", to: 3 });
    advance(FLIGHT_MS / 2);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 3 });
  });

  it("launches from a stop's own Where when not mid-flight", () => {
    const { visit, now } = setup();
    visit.land(2);
    visit.go(3);
    expect(visit.launch(now())).toEqual({ kind: "at", stop: 2 });
  });

  it("chains: each re-target launches from where the camera really is, however many times", () => {
    const { visit, at } = setup();
    const t0 = 1000;
    at(t0);
    visit.go(1);
    at(t0 + 0.3 * FLIGHT_MS); // 0.3 of the way, eased
    visit.go(2);
    const first = { kind: "flying", from: { kind: "at", stop: 0 }, to: 1, f: ease(0.3) };
    expect(visit.launch(t0 + 0.3 * FLIGHT_MS)).toEqual(first);
    at(t0 + 0.5 * FLIGHT_MS); // 0.2 of the second flight
    visit.go(3);
    const second = { kind: "flying", from: first, to: 2, f: ease(0.2) };
    expect(visit.launch(t0 + 0.5 * FLIGHT_MS)).toEqual(second);
    at(t0 + 0.75 * FLIGHT_MS); // 0.25 of the third flight
    visit.go(1);
    expect(visit.launch(t0 + 0.75 * FLIGHT_MS)).toEqual({ kind: "flying", from: second, to: 3, f: ease(0.25) });
    expect(visit.where(t0 + 0.75 * FLIGHT_MS)).toMatchObject({ kind: "flying", to: 1, f: 0 });
  });
});

describe("subscribers", () => {
  it("hear a move as it starts, and the landing", () => {
    const { visit, events, advance, now } = setup();
    visit.go(2);
    expect(events).toEqual([{ type: "move", from: { kind: "at", stop: 0 }, to: 2, step: LIST }]);
    advance(FLIGHT_MS);
    visit.where(now());
    expect(events[1]).toEqual({ type: "land", stop: 2, step: LIST });
    visit.back();
    expect(events[2]).toMatchObject({ type: "move", to: 0 });
  });

  it("hear a move and a landing for land()", () => {
    const { visit, events } = setup();
    visit.go(1);
    visit.land(3);
    expect(events.map((e) => e.type)).toEqual(["move", "move", "land"]);
    expect(events[1]).toMatchObject({ to: 3 });
  });

  it("hear a landing once, and can unsubscribe", () => {
    const { visit, events, advance, now } = setup();
    const heard: VisitEvent[] = [];
    const off = visit.subscribe((e) => heard.push(e));
    visit.go(1);
    advance(FLIGHT_MS);
    visit.where(now());
    visit.where(now());
    expect(events.filter((e) => e.type === "land")).toHaveLength(1);
    off();
    visit.go(2);
    expect(heard).toHaveLength(2);
  });
});

describe("reduced motion", () => {
  it("fades instead of flying: old stop until the midpoint, new one after", () => {
    const { visit, advance, now } = setup(true);
    visit.land(1);
    visit.go(3);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 1 });
    advance(FADE_MS / 2 - 1);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 1 });
    advance(1);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 3 });
    advance(FADE_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 3 });
  });

  it("moving is true through the whole fade, both halves, and false at rest", () => {
    const { visit, advance, now } = setup(true);
    visit.land(1);
    expect(visit.moving(now())).toBe(false);
    visit.go(3);
    expect(visit.moving(now())).toBe(true);
    advance(FADE_MS * 0.75);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 3 }); // reads as arrived, yet still moving
    expect(visit.moving(now())).toBe(true);
    advance(FADE_MS);
    expect(visit.moving(now())).toBe(false);
  });

  it("fade is 0 at rest, rises to 1 at the midpoint, and falls back to 0", () => {
    const { visit, advance, now } = setup(true);
    expect(visit.fade(now())).toBe(0);
    visit.go(2);
    expect(visit.fade(now())).toBe(0);
    advance(FADE_MS / 2);
    expect(visit.fade(now())).toBe(1);
    advance(FADE_MS / 4);
    expect(visit.fade(now())).toBeCloseTo(0.5);
    advance(FADE_MS);
    expect(visit.fade(now())).toBe(0);
  });

  it("is about 300 ms and never reports a flight", () => {
    expect(FADE_MS).toBe(300);
    const { visit, advance, now } = setup(true);
    visit.go(2);
    for (let i = 0; i < 6; i++) {
      expect(visit.where(now()).kind).toBe("at");
      advance(50);
    }
    expect(visit.launch(now())).toBeNull();
  });

  it("next during a fade means the step after its destination, and land is instant", () => {
    const { visit, now } = setup(true);
    visit.go(2);
    visit.next();
    expect(visit.step()).toEqual(SOFTWARE_FACTORY);
    visit.next();
    visit.next();
    visit.next();
    expect(visit.step()).toEqual(WHY);
    expect(visit.target()).toBe(3);
    visit.land(1);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 1 });
    expect(visit.fade(now())).toBe(0);
  });

  it("subscribers hear the landing after the fade", () => {
    const { visit, events, advance, now } = setup(true);
    visit.go(2);
    advance(FADE_MS);
    visit.where(now());
    expect(events.map((e) => e.type)).toEqual(["move", "land"]);
  });
});

describe("reduced motion: a press during a fade waits (Adham, #176)", () => {
  it("keeps only the latest press and starts it when the fade ends", () => {
    const { visit, events, advance, now } = setup(true);
    visit.go(2);
    advance(100);
    visit.go(3);
    visit.go(1);
    expect(visit.target()).toBe(1);
    advance(FADE_MS / 2 - 100);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 }); // the first fade finishes its own move
    advance(FADE_MS / 2);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 });
    expect(visit.fade(now())).toBe(0); // the waiting move starts on the next read
    advance(FADE_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 1 });
    expect(events.filter((e) => e.type === "move").map((e) => (e as { to: number }).to)).toEqual([2, 1]);
  });

  it("a press back to the stop being faded to cancels the waiting one", () => {
    const { visit, events, advance, now } = setup(true);
    visit.go(2);
    visit.go(3);
    visit.go(2);
    advance(FADE_MS * 3);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 });
    expect(events.filter((e) => e.type === "move")).toHaveLength(1);
  });

  it("presses every 160 ms: fades start at least a fade apart, the last press lands, one move event per fade", () => {
    const { visit, events, advance, now, at } = setup(true);
    const t0 = now();
    const starts: number[] = [];
    visit.subscribe((e) => { if (e.type === "move") starts.push(now()); });
    let wasFading = false;
    let lastPressed = 0;
    for (let ms = 0; ms <= 2000 + FADE_MS * 3; ms += 10) {
      at(t0 + ms);
      if (ms <= 2000 && ms % 160 === 0) { lastPressed = (ms / 160) % 2 ? 3 : 1; visit.go(lastPressed); }
      const f = visit.fade(now());
      if (f > 0 && !wasFading) wasFading = true;
      if (f === 0) wasFading = false;
    }
    expect(starts.length).toBeGreaterThan(1);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(FADE_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: lastPressed });
    expect(events.filter((e) => e.type === "move")).toHaveLength(starts.length);
  });

  it("fade() never drops by more than a 10 ms step's share while presses arrive", () => {
    const { visit, now, at } = setup(true);
    const t0 = now();
    let prev = 0;
    for (let ms = 0; ms <= 3000; ms += 10) {
      at(t0 + ms);
      if (ms <= 2000 && ms % 160 === 0) visit.go((ms / 160) % 2 ? 3 : 1);
      const f = visit.fade(now());
      expect(prev - f).toBeLessThanOrEqual(10 / (FADE_MS / 2) + 1e-9);
      prev = f;
    }
  });
});

describe("a press during a flight or fade is held as a stop and a page", () => {
  it("under reduced motion, a page press during a fade waits and applies on landing", () => {
    const { visit, events, advance, now } = setup(true);
    visit.go(1);
    advance(100);
    visit.next(); // Barracuda, pressed during the fade to Work
    expect(visit.step()).toEqual(BARRACUDA);
    expect(events.filter((e) => e.type === "page")).toEqual([]); // held: nothing moves yet
    advance(FADE_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 1 });
    expect(visit.step()).toEqual(BARRACUDA);
    expect(events.map((e) => e.type)).toEqual(["move", "land", "page"]);
    expect(events.at(-1)).toEqual({ type: "page", stop: 1, step: BARRACUDA });
  });

  it("under reduced motion, a stop pressed after a page press during the fade to that stop keeps the pressed page (#301)", () => {
    const { visit, events, advance, now } = setup(true);
    visit.go(1);
    advance(100);
    visit.go(BARRACUDA); // Work's later page waits for the fade
    visit.go(1); // the HUD link to the stop being faded to: a number, not a step
    expect(visit.step()).toEqual(BARRACUDA);
    advance(FADE_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 1 });
    expect(visit.step()).toEqual(BARRACUDA);
    expect(events.filter((e) => e.type === "move")).toHaveLength(1);
  });

  it("under reduced motion, a press for another station's page during a fade ends on that page", () => {
    const { visit, advance, now } = setup(true);
    visit.go(1);
    advance(100);
    visit.go(CONTACT);
    expect(visit.step()).toEqual(CONTACT);
    advance(FADE_MS);
    visit.where(now());
    advance(FADE_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 3 });
    expect(visit.step()).toEqual(CONTACT);
  });

  it("only the latest press is kept, as a stop and a page", () => {
    const { visit, advance, now } = setup(true);
    visit.go(2);
    advance(50);
    visit.go(BARRACUDA);
    visit.go(HOME_LAB);
    visit.go(CONTACT);
    expect(visit.step()).toEqual(CONTACT);
    advance(FADE_MS * 3);
    visit.where(now());
    expect(visit.step()).toEqual(CONTACT);
  });

  it("a press back to the place being faded to cancels the waiting one", () => {
    const { visit, events, advance, now } = setup(true);
    visit.go(MEDIASAFE);
    visit.go(CONTACT);
    visit.go(MEDIASAFE);
    advance(FADE_MS * 3);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 });
    expect(visit.step()).toEqual(MEDIASAFE);
    expect(events.map((e) => e.type)).toEqual(["move", "land"]);
  });

  it("a stop (not a page) pressed during a fade to a page of that stop keeps the page", () => {
    const { visit, advance, now } = setup(true);
    visit.go(MEDIASAFE);
    visit.go(2);
    advance(FADE_MS * 2);
    visit.where(now());
    expect(visit.step()).toEqual(MEDIASAFE);
  });

  it("with flights, a press during a flight re-targets at once, to a stop and a page", () => {
    const { visit, advance, now } = setup();
    visit.go(1);
    advance(300);
    visit.go(HOME_LAB);
    expect(visit.step()).toEqual(HOME_LAB);
    expect(visit.where(now())).toMatchObject({ kind: "flying", to: 2, f: 0 });
    advance(FLIGHT_MS);
    expect(visit.where(now())).toEqual({ kind: "at", stop: 2 });
    expect(visit.step()).toEqual(HOME_LAB);
  });
});
