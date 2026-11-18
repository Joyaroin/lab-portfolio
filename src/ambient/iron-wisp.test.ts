import { describe, expect, it } from "vitest";
import { BURST_MS, drawIronWisp, PUFF_COUNT, PUFF_GAP_MS, PUFF_LIFE_MS, WISP_CYCLE_MS, WISP_H, WISP_STILL_POS, WISP_W, wispPuffs } from "./iron-wisp";
import { recordingContext } from "./recording-context.test-helper";
import { STILL_T } from "./still";

/** The cycle's time `pos` (ms into the burst) as a `t`. */
const at = (pos: number) => STILL_T - WISP_STILL_POS + pos;

describe("wispPuffs", () => {
  it("is empty in the pause, and the pause lies after the burst", () => {
    expect(BURST_MS).toBeLessThan(WISP_CYCLE_MS);
    for (const pos of [BURST_MS, BURST_MS + 1, (BURST_MS + WISP_CYCLE_MS) / 2, WISP_CYCLE_MS - 1]) expect(wispPuffs(at(pos)), `at ${pos}`).toEqual([]);
  });
  it("has no wisp at STILL_T, and none a cycle on", () => {
    expect(wispPuffs(STILL_T)).toEqual([]);
    expect(wispPuffs(STILL_T + 4 * WISP_CYCLE_MS)).toEqual([]);
  });
  it("starts a puff at the tip, faint, and lets off up to PUFF_COUNT, one every PUFF_GAP_MS", () => {
    const first = wispPuffs(at(10));
    expect(first).toHaveLength(1);
    expect(first[0].y).toBeCloseTo(1, 1);
    expect(first[0].alpha).toBeLessThan(0.02);
    expect(wispPuffs(at(PUFF_GAP_MS + 10))).toHaveLength(2);
    expect(wispPuffs(at(PUFF_COUNT * PUFF_GAP_MS - 10)).length).toBeLessThanOrEqual(PUFF_COUNT);
    expect(wispPuffs(at(2 * PUFF_GAP_MS + 10))).toHaveLength(3);
  });
  it("rises: a puff is higher (smaller y) a moment later, and stays inside the plane", () => {
    const a = wispPuffs(at(400))[0], b = wispPuffs(at(700))[0];
    expect(b.y).toBeLessThan(a.y);
    for (let pos = 0; pos < BURST_MS; pos += 37) for (const p of wispPuffs(at(pos))) {
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(1);
    }
  });
  it("fades: strongest half-way up, nothing at the start and the end of its life", () => {
    const mid = wispPuffs(at(PUFF_LIFE_MS / 2))[0], late = wispPuffs(at(PUFF_LIFE_MS * 0.97))[0];
    expect(mid.alpha).toBeGreaterThan(0.4);
    expect(late.alpha).toBeLessThan(mid.alpha / 4);
  });
});

describe("drawIronWisp", () => {
  it("clears the canvas and draws no puff at STILL_T: the still frame is a clear canvas", () => {
    const { ctx, calls } = recordingContext();
    drawIronWisp(ctx, STILL_T);
    expect(calls).toEqual([`clearRect(0,0,${WISP_W},${WISP_H})`]);
  });
  it("clears the canvas first and then paints a puff, mid-burst, as translucent", () => {
    const { ctx, calls } = recordingContext();
    drawIronWisp(ctx, at(PUFF_LIFE_MS / 2));
    expect(calls[0]).toBe(`clearRect(0,0,${WISP_W},${WISP_H})`);
    expect(calls.length).toBeGreaterThan(1);
  });
  it("a still frame after a mid-burst tick, through the same canvas, leaves nothing but the clear", () => {
    const { ctx, calls } = recordingContext();
    drawIronWisp(ctx, at(PUFF_LIFE_MS / 2));
    calls.length = 0;
    expect(drawIronWisp(ctx, STILL_T)).not.toBe(false); // the canvas changed, so it must be uploaded
    expect(calls).toEqual([`clearRect(0,0,${WISP_W},${WISP_H})`]);
  });
});
