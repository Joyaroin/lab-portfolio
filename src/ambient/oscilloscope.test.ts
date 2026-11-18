import { describe, expect, it } from "vitest";
import { drawOscilloscope, SCOPE_CYCLE_MS, SCOPE_H, SCOPE_PERIODS, SCOPE_W, scopeShape, scopeTrace } from "./oscilloscope";
import { recordingContext } from "./recording-context.test-helper";
import { STILL_T } from "./still";

const N = 48;
/** The waveform at rest: the shape across the screen, not scrolled at all. */
const atRest = Array.from({ length: N }, (_, i) => scopeShape((i / (N - 1)) * SCOPE_PERIODS));
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));

describe("scopeTrace", () => {
  it("has the asked number of heights, all inside -1..1", () => {
    for (const t of [0, 1, 777, STILL_T, 123_456]) {
      const tr = scopeTrace(t, N);
      expect(tr).toHaveLength(N);
      for (const v of tr) { expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); }
    }
  });
  it("scrolls: the trace at a few times is a different one, and a quarter-cycle on is the shape shifted left by a quarter period", () => {
    const a = scopeTrace(STILL_T, N), b = scopeTrace(STILL_T + 600, N);
    expect(b).not.toEqual(a);
    expect(b[0]).toBeCloseTo(scopeShape(0.25), 9);
    expect(scopeTrace(STILL_T + 1200, N)[0]).toBeCloseTo(scopeShape(0.5), 9);
  });
  it("comes round after one cycle", () => {
    for (const t of [0, 500, 1777]) close(scopeTrace(t + SCOPE_CYCLE_MS, N), scopeTrace(t, N));
  });
  it("is the waveform at rest at STILL_T, and has scrolled away from it just before and after", () => {
    close(scopeTrace(STILL_T, N), atRest);
    close(scopeTrace(STILL_T + 3 * SCOPE_CYCLE_MS, N), atRest);
    expect(scopeTrace(STILL_T - 100, N)).not.toEqual(atRest);
    expect(scopeTrace(STILL_T + 100, N)).not.toEqual(atRest);
  });
});

describe("drawOscilloscope", () => {
  it("fills the whole canvas, opaque, and draws no text", () => {
    const { ctx, texts, calls } = recordingContext();
    drawOscilloscope(ctx, 4321);
    expect(calls).toContain(`fillRect(0,0,${SCOPE_W},${SCOPE_H})`);
    expect(calls.some((c) => c.startsWith("clearRect"))).toBe(false);
    expect(texts).toEqual([]);
  });
  it("draws the trace as one line with a point for each column of the canvas", () => {
    const { ctx, calls } = recordingContext();
    drawOscilloscope(ctx, STILL_T);
    expect(calls.filter((c) => c.startsWith("lineTo")).length + calls.filter((c) => c.startsWith("moveTo(0,")).length).toBeGreaterThanOrEqual(SCOPE_W);
  });
  it("draws the same at STILL_T as a whole number of cycles later (so the stop's frame is the one the cycle shows)", () => {
    const a = recordingContext(), b = recordingContext();
    drawOscilloscope(a.ctx, STILL_T); drawOscilloscope(b.ctx, STILL_T + 5 * SCOPE_CYCLE_MS);
    expect(b.calls).toEqual(a.calls);
  });
});
