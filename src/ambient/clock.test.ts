import { describe, expect, it } from "vitest";
import { CLOCK_H, CLOCK_START_S, CLOCK_W, createClock, drawHands, handAngles, shownSeconds, slipAt, slipsBy, SLIP_GAPS_S } from "./clock";
import { recordingContext } from "./recording-context.test-helper";
import { STILL_T } from "./still";
import { ambientSurfaces, createSurfaceDriver, isFilled } from "./surfaces";

/** `s` seconds after STILL_T, in ms. */
const after = (s: number) => STILL_T + s * 1000;

describe("the clock's hands", () => {
  it("at STILL_T show the made-up time, 10:09:25, with the hands where the baked ones were", () => {
    expect(shownSeconds(STILL_T)).toBe(CLOCK_START_S);
    const a = handAngles(CLOCK_START_S);
    expect(a.hour).toBeCloseTo(304.6, 0);
    expect(a.minute).toBeCloseTo(56.5, 9);
    expect(a.second).toBeCloseTo(150, 9);
  });
  it("show the made-up time, not the visitor's: they depend on t alone", () => {
    expect(shownSeconds(STILL_T)).toBe(shownSeconds(STILL_T));
    const real = new Date(); const now = real.getHours() % 12 * 3600 + real.getMinutes() * 60 + real.getSeconds();
    expect(CLOCK_START_S).not.toBe(now);
    expect(shownSeconds(0)).toBe(CLOCK_START_S); // before STILL_T nothing has run yet
  });
  it("tick at normal speed: one second a second, the second hand 6 degrees a tick, the minute hand a full turn in an hour", () => {
    expect(shownSeconds(after(1))).toBe(CLOCK_START_S + 1);
    expect(shownSeconds(after(2.999))).toBe(CLOCK_START_S + 2);
    expect(handAngles(CLOCK_START_S + 1).second - handAngles(CLOCK_START_S).second).toBeCloseTo(6, 9);
    expect(handAngles(CLOCK_START_S + 3600).minute).toBeCloseTo(handAngles(CLOCK_START_S).minute, 9);
    expect(handAngles(CLOCK_START_S + 3600).hour - handAngles(CLOCK_START_S).hour).toBeCloseTo(30, 9);
  });
  it("at a few t: a quarter hour on, the minute hand is on 12 and the second hand on 12", () => {
    const s = shownSeconds(after(60));
    expect(s).toBe(CLOCK_START_S + 60);
    const a = handAngles(10 * 3600 + 10 * 60 + 25);
    expect(a.minute).toBeCloseTo(60 + 25 / 60 * 6, 9);
    expect(handAngles(11 * 3600).minute).toBe(0);
    expect(handAngles(11 * 3600).second).toBe(0);
    expect(handAngles(3 * 3600).hour).toBeCloseTo(90, 9);
  });
  it("wrap at twelve hours", () => {
    expect(handAngles(0).hour).toBe(0);
    expect(handAngles(12 * 3600 - 1).hour).toBeLessThan(360);
  });
});

describe("the clock's slip", () => {
  it("comes every two to three minutes, first after the first gap", () => {
    for (const g of SLIP_GAPS_S) { expect(g).toBeGreaterThanOrEqual(120); expect(g).toBeLessThanOrEqual(180); }
    expect(slipAt(1)).toBe(SLIP_GAPS_S[0]);
    for (let k = 1; k < 40; k++) { const gap = slipAt(k + 1) - slipAt(k); expect(gap).toBeGreaterThanOrEqual(120); expect(gap).toBeLessThanOrEqual(180); }
    expect(slipsBy(slipAt(1) - 1)).toBe(0);
    expect(slipsBy(slipAt(1))).toBe(1);
    expect(slipsBy(slipAt(7))).toBe(7);
    expect(slipsBy(slipAt(7) - 1)).toBe(6);
  });
  it("steps the second hand back one second at the slip, in the times around the first: ticks before, at and after it", () => {
    const s = slipAt(1), at = (n: number) => shownSeconds(after(n));
    expect(at(s - 2)).toBe(CLOCK_START_S + s - 2);
    expect(at(s - 1)).toBe(CLOCK_START_S + s - 1);
    expect(at(s)).toBe(CLOCK_START_S + s - 2); // one second back from the tick before
    expect(at(s)).toBe(at(s - 1) - 1);
    expect(at(s + 1)).toBe(at(s) + 1); // then carries on at normal speed
    expect(at(s + 2)).toBe(at(s) + 2);
  });
  it("steps back at the next slips too, and only at them", () => {
    let backs = 0;
    for (let n = 1; n < 3600; n++) {
      const d = shownSeconds(after(n)) - shownSeconds(after(n - 1));
      if (d === -1) backs++; else expect(d).toBe(1);
    }
    expect(backs).toBe(slipsBy(3599));
    expect(backs).toBeGreaterThanOrEqual(3600 / 180 - 1);
    expect(backs).toBeLessThanOrEqual(3600 / 120);
  });
  it("is the hand going back 6 degrees on the face", () => {
    const s = slipAt(1);
    const before = handAngles(shownSeconds(after(s - 1))).second, now = handAngles(shownSeconds(after(s))).second;
    expect(before - now).toBeCloseTo(6, 9);
  });
});

describe("the clock's frames", () => {
  it("draws the hands over a cleared canvas, in the face's size: three hands and the pivot, no words", () => {
    const r = recordingContext();
    drawHands(r.ctx, CLOCK_START_S);
    expect(r.calls[0]).toBe(`clearRect(0,0,${CLOCK_W},${CLOCK_H})`);
    expect(r.calls.filter((c) => c.startsWith("stroke("))).toHaveLength(3);
    expect(r.texts).toEqual([]);
  });
  it("the still frame at STILL_T is the hands at the made-up time", () => {
    const a = recordingContext(), b = recordingContext();
    createClock()(a.ctx, STILL_T);
    drawHands(b.ctx, CLOCK_START_S);
    expect(a.calls).toEqual(b.calls);
  });
});

describe("the clock through the surface driver", () => {
  const clock = () => ambientSurfaces([]).filter(isFilled).find((s) => s.id === "clock")!;
  const run = () => {
    const r = recordingContext();
    let uploads = 0;
    const driver = createSurfaceDriver([clock()], () => ({ ctx: r.ctx, upload: () => { uploads++; } }));
    return { driver, r, uploads: () => uploads };
  };
  it("reports unchanged across ticks within one second: one upload for the ticks of a second, one more when the next begins", () => {
    const { driver, uploads } = run();
    driver.tick(after(10));
    expect(uploads()).toBe(1);
    for (let t = after(10) + 83; t < after(11); t += 83) driver.tick(t);
    expect(uploads()).toBe(1);
    driver.tick(after(11));
    expect(uploads()).toBe(2);
  });
  it("a second of ticks at 83 ms costs one upload in twelve", () => {
    const { driver, uploads } = run();
    for (let t = after(20); t < after(30); t += 83) driver.tick(t);
    expect(uploads()).toBe(10);
  });
  it("puts the still frame on the glass after a tick mid-cycle: painted and uploaded, not skipped", () => {
    const { driver, r, uploads } = run();
    driver.tick(after(75));
    const before = uploads();
    r.calls.length = 0;
    driver.still();
    expect(uploads()).toBe(before + 1);
    const ref = recordingContext();
    drawHands(ref.ctx, CLOCK_START_S);
    expect(r.calls).toEqual(["save()", ...ref.calls, "restore()"]);
  });
});
