import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ambientRedraws, createAmbientRedraw, REDRAW_MS, type RedrawState } from "./redraw";

const overview: RedrawState = { where: { kind: "at", stop: 0 }, framing: "square", reduced: false };

describe("ambientRedraws", () => {
  it("is true only at the overview, in landscape framing, with no flight and without reduced motion", () => {
    expect(ambientRedraws(overview)).toBe(true);
  });
  it("is false at every station", () => {
    for (const stop of [1, 2, 3]) expect(ambientRedraws({ ...overview, where: { kind: "at", stop } })).toBe(false);
  });
  it("is false in a flight, whichever way it goes", () => {
    for (const [from, to] of [[0, 1], [1, 0], [2, 3], [0, 0]]) {
      expect(ambientRedraws({ ...overview, where: { kind: "flying", from, to, f: 0.5 } })).toBe(false);
    }
  });
  it("is false in portrait framing", () => {
    expect(ambientRedraws({ ...overview, framing: "portrait" })).toBe(false);
  });
  it("is false under reduced motion", () => {
    expect(ambientRedraws({ ...overview, reduced: true })).toBe(false);
  });
});

describe("createAmbientRedraw", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const make = () => {
    const ticks: number[] = [];
    const redraw = createAmbientRedraw(() => ticks.push(Date.now()));
    return { redraw, ticks };
  };

  it("ticks about every 83 ms while the overview is showing, and not before the first interval", () => {
    const { redraw, ticks } = make();
    redraw.sync(overview);
    expect(ticks).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(REDRAW_MS).toBe(83);
    expect(ticks).toHaveLength(Math.floor(1000 / REDRAW_MS)); // 12, about 12 frames a second
    expect(ticks[1] - ticks[0]).toBe(REDRAW_MS);
  });

  it("is one timer, however many times it is told the same thing", () => {
    const { redraw, ticks } = make();
    for (let i = 0; i < 5; i++) redraw.sync(overview);
    vi.advanceTimersByTime(1000);
    expect(ticks).toHaveLength(12);
  });

  it("stops when a flight begins, and never runs through it", () => {
    const { redraw, ticks } = make();
    redraw.sync(overview);
    vi.advanceTimersByTime(500);
    const before = ticks.length;
    redraw.sync({ ...overview, where: { kind: "flying", from: 0, to: 1, f: 0.1 } });
    vi.advanceTimersByTime(5000);
    expect(ticks).toHaveLength(before);
    redraw.sync({ ...overview, where: { kind: "flying", from: 0, to: 1, f: 0.9 } });
    vi.advanceTimersByTime(5000);
    expect(ticks).toHaveLength(before);
  });

  it("never starts at a station, in portrait or under reduced motion", () => {
    const { redraw, ticks } = make();
    redraw.sync({ ...overview, where: { kind: "at", stop: 2 } });
    redraw.sync({ ...overview, framing: "portrait" });
    redraw.sync({ ...overview, reduced: true });
    vi.advanceTimersByTime(10_000);
    expect(ticks).toEqual([]);
  });

  it("stops when the window turns to portrait, and starts again on the overview in landscape", () => {
    const { redraw, ticks } = make();
    redraw.sync(overview);
    vi.advanceTimersByTime(250);
    redraw.sync({ ...overview, framing: "portrait" });
    const stopped = ticks.length;
    vi.advanceTimersByTime(2000);
    expect(ticks).toHaveLength(stopped);
    redraw.sync(overview);
    vi.advanceTimersByTime(250);
    expect(ticks.length).toBeGreaterThan(stopped);
  });

  it("says whether it is running, and stop() ends it", () => {
    const { redraw, ticks } = make();
    expect(redraw.running()).toBe(false);
    redraw.sync(overview);
    expect(redraw.running()).toBe(true);
    redraw.stop();
    expect(redraw.running()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(ticks).toEqual([]);
  });
});
