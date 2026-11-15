import { describe, it, expect } from "vitest";
import { easeOffset, type V3 } from "./ease";

// The parallax offset eases toward the pointer's target. Once it is close enough it must land on the target
// exactly and stay there, so that frames the ambient screens ask for (#280) can't creep the camera.
const k = 1 - Math.exp(-(1 / 60) * 6); // a 60 fps frame

describe("easeOffset", () => {
  it("moves part of the way toward the target while far from it", () => {
    const r = easeOffset([0, 0, 0], [1, 0, 0], k);
    expect(r.resting).toBe(false);
    expect(r.offset[0]).toBeCloseTo(k);
  });

  it("comes to rest exactly on the target, then more frames change nothing at all", () => {
    const target: V3 = [0.0123456789, -0.0071, 0.00031];
    let o: V3 = [0, 0, 0];
    let frames = 0;
    for (; frames < 1000; frames++) {
      const r = easeOffset(o, target, k);
      o = r.offset;
      if (r.resting) break;
    }
    expect(frames).toBeLessThan(1000);
    expect(o).toEqual(target);
    for (let i = 0; i < 500; i++) {
      const r = easeOffset(o, target, i % 2 ? k : 0.4); // any frame length
      expect(r.resting).toBe(true);
      expect(r.offset).toEqual(target);
      o = r.offset;
    }
  });

  it("rests at once on a target it is already on", () => {
    const r = easeOffset([0.5, 0.25, -0.125], [0.5, 0.25, -0.125], k);
    expect(r).toEqual({ offset: [0.5, 0.25, -0.125], resting: true });
  });

  it("lets a parallax on its way to nothing stop a couple of millimetres off, as before", () => {
    const r = easeOffset([0.0015, 0, 0], [0, 0, 0], k);
    expect(r.resting).toBe(true);
    expect(r.offset).toEqual([0, 0, 0]);
    expect(easeOffset([0.02, 0, 0], [0, 0, 0], k).resting).toBe(false);
  });

  it("jumps straight to the target when k is 1 (reduced motion)", () => {
    expect(easeOffset([1, 2, 3], [0, 0, 0], 1)).toEqual({ offset: [0, 0, 0], resting: true });
  });
});
