import { describe, it, expect } from "vitest";
import { trafficDots, pointAlong, drawTraffic, TRAFFIC_PATH, DOT_COUNT, CROSSING_MS } from "./traffic";
import { STILL_T } from "./still";
import { ui } from "../content";
import { recordingContext } from "./recording-context.test-helper";

// How far a point is from the nearest segment of the path.
function distanceToPath(x: number, y: number) {
  let best = Infinity;
  for (let i = 0; i < TRAFFIC_PATH.length - 1; i++) {
    const [ax, ay] = TRAFFIC_PATH[i], [bx, by] = TRAFFIC_PATH[i + 1];
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const f = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len2));
    best = Math.min(best, Math.hypot(x - (ax + f * (bx - ax)), y - (ay + f * (by - ay))));
  }
  return best;
}

describe("the lab traffic's path", () => {
  it("runs Tunnel → Proxmox → k3s: left to right, one waypoint under each box", () => {
    expect(TRAFFIC_PATH).toHaveLength(3);
    const xs = TRAFFIC_PATH.map((p) => p[0]);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    // the boxes are 110 wide at x 20, 145 and 270 (drawTraffic): each waypoint is inside its own
    expect(xs[0]).toBeGreaterThan(20); expect(xs[0]).toBeLessThan(130);
    expect(xs[1]).toBeGreaterThan(145); expect(xs[1]).toBeLessThan(255);
    expect(xs[2]).toBeGreaterThan(270); expect(xs[2]).toBeLessThan(380);
  });
});

describe("trafficDots", () => {
  it("lie on the path at every sampled time", () => {
    for (let t = 0; t < 60_000; t += 137) {
      const dots = trafficDots(t);
      expect(dots).toHaveLength(DOT_COUNT);
      for (const d of dots) expect(distanceToPath(d.x, d.y), `dot at ${t}`).toBeLessThan(1e-6);
    }
  });
  it("lie between the first waypoint and the last", () => {
    for (let t = 0; t < 20_000; t += 211) for (const d of trafficDots(t)) {
      expect(d.x).toBeGreaterThanOrEqual(TRAFFIC_PATH[0][0] - 1e-9);
      expect(d.x).toBeLessThanOrEqual(TRAFFIC_PATH[2][0] + 1e-9);
    }
  });
  it("move between two times, left to right", () => {
    const a = trafficDots(1000), b = trafficDots(1200);
    expect(b).not.toEqual(a);
    a.forEach((d, k) => {
      // a dot that has not wrapped has gone right
      if (b[k].x > d.x) expect(b[k].x - d.x).toBeGreaterThan(1);
    });
    expect(a.some((d, k) => b[k].x > d.x)).toBe(true);
  });
  it("are spread along the path, fade at its ends and are all back after one crossing", () => {
    const dots = trafficDots(STILL_T);
    expect(new Set(dots.map((d) => d.x.toFixed(3))).size).toBe(DOT_COUNT);
    for (const d of dots) { expect(d.alpha).toBeGreaterThanOrEqual(0); expect(d.alpha).toBeLessThanOrEqual(1); }
    const sorted = (ds: ReturnType<typeof trafficDots>) => ds.map((d) => d.x.toFixed(6)).sort();
    expect(sorted(trafficDots(STILL_T + CROSSING_MS / DOT_COUNT))).toEqual(sorted(dots));
    expect(trafficDots(STILL_T + CROSSING_MS)).toEqual(trafficDots(STILL_T).map((d) => ({
      x: expect.closeTo(d.x, 6), y: expect.closeTo(d.y, 6), alpha: expect.closeTo(d.alpha, 6),
    })));
  });
  it("in the still frame are in place on the path, and some are visible", () => {
    expect(trafficDots(STILL_T)).toEqual(trafficDots(STILL_T));
    expect(trafficDots(STILL_T).filter((d) => d.alpha > 0.3).length).toBeGreaterThanOrEqual(3);
  });
});

describe("pointAlong", () => {
  it("is the first point at 0, the last at 1, and by length in between", () => {
    expect(pointAlong(TRAFFIC_PATH, 0)).toEqual([75, 220]);
    expect(pointAlong(TRAFFIC_PATH, 1)).toEqual([325, 220]);
    expect(pointAlong(TRAFFIC_PATH, 0.5)).toEqual([200, 220]);
    expect(pointAlong([[0, 0], [10, 0], [10, 30]], 0.5)).toEqual([10, 10]);
  });
});

describe("drawTraffic", () => {
  it("draws the three boxes' words and the caption, with no status word", () => {
    const { ctx, texts } = recordingContext();
    drawTraffic(ctx, STILL_T);
    expect(texts).toEqual([ui.ambient.tunnel, ui.ambient.proxmox, ui.ambient.k3s, ui.ambient.trafficCaption]);
    expect(texts).toEqual(["Tunnel", "Proxmox", "k3s", "internet → home lab"]);
  });
});
