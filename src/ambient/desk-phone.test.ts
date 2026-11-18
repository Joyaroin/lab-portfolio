import { describe, expect, it } from "vitest";
import {
  createDeskPhone, GLOW_STEPS, PHONE_CYCLE_MS, PHONE_H, PHONE_LIT_AT, PHONE_LIT_MS, PHONE_RAMP_MS, PHONE_STILL_POS, PHONE_W, phoneGlow, phoneLevel,
} from "./desk-phone";
import { recordingContext } from "./recording-context.test-helper";
import { STILL_T } from "./still";
import { createSurfaceDriver, ambientSurfaces, isFilled } from "./surfaces";

/** The cycle's position `p` as a `t`, in the cycle that holds STILL_T (and `k` cycles later). */
const at = (p: number, k = 0) => STILL_T - PHONE_STILL_POS + p + k * PHONE_CYCLE_MS;

describe("the desk phone's lit window", () => {
  it("is dark at STILL_T, and for the whole of the dark time before the light", () => {
    expect(phoneGlow(STILL_T)).toBe(0);
    expect(phoneGlow(at(0))).toBe(0);
    expect(phoneGlow(at(PHONE_LIT_AT - 1))).toBe(0);
  });
  it("lights at PHONE_LIT_AT, is at full light in the middle, and is dark again PHONE_LIT_MS later", () => {
    expect(phoneGlow(at(PHONE_LIT_AT))).toBe(0); // the ramp starts from dark
    expect(phoneGlow(at(PHONE_LIT_AT + PHONE_RAMP_MS / 2))).toBeCloseTo(0.5, 9);
    expect(phoneGlow(at(PHONE_LIT_AT + PHONE_LIT_MS / 2))).toBe(1);
    expect(phoneGlow(at(PHONE_LIT_AT + PHONE_LIT_MS - PHONE_RAMP_MS / 2))).toBeCloseTo(0.5, 9);
    expect(phoneGlow(at(PHONE_LIT_AT + PHONE_LIT_MS))).toBe(0);
    expect(phoneGlow(at(PHONE_CYCLE_MS - 1))).toBe(0);
  });
  it("is lit for a few seconds, not a blink and not a long stay", () => {
    expect(PHONE_LIT_MS).toBeGreaterThanOrEqual(2_000);
    expect(PHONE_LIT_MS).toBeLessThanOrEqual(6_000);
  });
  it("comes round about once a minute: the interval is 60 s, and the same window is lit one interval on", () => {
    expect(PHONE_CYCLE_MS).toBe(60_000);
    const mid = at(PHONE_LIT_AT + PHONE_LIT_MS / 2);
    expect(phoneGlow(mid)).toBe(1);
    expect(phoneGlow(mid + PHONE_CYCLE_MS)).toBe(1);
    expect(phoneGlow(mid + 3 * PHONE_CYCLE_MS)).toBe(1);
    expect(phoneGlow(mid + PHONE_CYCLE_MS / 2)).toBe(0);
    // lit in exactly one stretch a minute: count the lit seconds over three cycles
    let lit = 0;
    for (let t = at(0); t < at(0, 3); t += 100) if (phoneGlow(t) > 0) lit++;
    expect(lit * 100).toBeGreaterThan(3 * (PHONE_LIT_MS - 2 * PHONE_RAMP_MS));
    expect(lit * 100).toBeLessThanOrEqual(3 * PHONE_LIT_MS);
  });
});

describe("the desk phone's frames", () => {
  it("the still frame is dark: it clears the whole canvas and draws nothing on it", () => {
    const r = recordingContext();
    createDeskPhone()(r.ctx, STILL_T);
    expect(r.calls).toEqual([`clearRect(0,0,${PHONE_W},${PHONE_H})`]);
  });
  it("a lit frame draws the envelope with no words", () => {
    const r = recordingContext();
    createDeskPhone()(r.ctx, at(PHONE_LIT_AT + PHONE_LIT_MS / 2));
    expect(r.calls[0]).toBe(`clearRect(0,0,${PHONE_W},${PHONE_H})`);
    expect(r.calls.some((c) => c.startsWith("fillRect"))).toBe(true);
    expect(r.calls.some((c) => c.startsWith("strokeRect"))).toBe(true);
    expect(r.texts).toEqual([]);
  });
  it("is at GLOW_STEPS at full light and 0 when dark", () => {
    expect(phoneLevel(at(PHONE_LIT_AT + PHONE_LIT_MS / 2))).toBe(GLOW_STEPS);
    expect(phoneLevel(STILL_T)).toBe(0);
  });
});

describe("the desk phone through the surface driver", () => {
  const phone = () => ambientSurfaces([]).filter(isFilled).find((s) => s.id === "desk-phone")!;
  const run = () => {
    const r = recordingContext();
    let uploads = 0;
    const driver = createSurfaceDriver([phone()], () => ({ ctx: r.ctx, upload: () => { uploads++; } }));
    return { driver, r, uploads: () => uploads };
  };
  it("reports unchanged across ticks while dark: the first tick paints, the ones after are not uploaded", () => {
    const { driver, r, uploads } = run();
    driver.still();
    expect(uploads()).toBe(1);
    r.calls.length = 0;
    for (let t = at(1_000); t < at(PHONE_LIT_AT - 1_000); t += 83) driver.tick(t);
    expect(uploads()).toBe(1);
    expect(r.calls.filter((c) => c.startsWith("clearRect") || c.startsWith("fillRect"))).toEqual([]);
  });
  it("uploads when the light comes on, and again for each change of glow, then not while it holds at full", () => {
    const { driver, uploads } = run();
    driver.still();
    const before = uploads();
    driver.tick(at(PHONE_LIT_AT + PHONE_RAMP_MS / 2));
    expect(uploads()).toBe(before + 1);
    driver.tick(at(PHONE_LIT_AT + PHONE_LIT_MS / 2));
    const full = uploads();
    driver.tick(at(PHONE_LIT_AT + PHONE_LIT_MS / 2 + 83));
    expect(uploads()).toBe(full);
  });
  it("puts the dark still frame on the glass after a lit tick: it is painted and uploaded, not skipped", () => {
    const { driver, r, uploads } = run();
    driver.tick(at(PHONE_LIT_AT + PHONE_LIT_MS / 2));
    const lit = uploads();
    r.calls.length = 0;
    driver.still();
    expect(uploads()).toBe(lit + 1);
    expect(r.calls).toEqual(["save()", `clearRect(0,0,${PHONE_W},${PHONE_H})`, "restore()"]);
  });
});
