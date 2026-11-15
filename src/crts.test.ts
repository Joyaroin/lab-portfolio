import { describe, it, expect } from "vitest";
import layout from "./room-layout.json" with { type: "json" };
import { crts, spares, CRT_GLASS, SCREEN_LAYER, PLANE_INSET, glassCorners, phosphorCorners } from "./crts";
import { stations } from "./content";

describe("the TV list", () => {
  it("has one entry per station, in tour order: Work, Projects, About me", () => {
    expect(crts.map((c) => c.id)).toEqual(["work", "projects", "about"]);
    expect(crts.map((c) => c.id)).toEqual(stations.map((s) => s.id));
  });
  it("puts each station on its CRT: Work on MediaSafe's, Projects on the bench TV, About me on Contact's", () => {
    expect(crts.map((c) => c.screen)).toEqual([[-1.33, 1.04, -1.33], [1.42, 1.2, -0.18], [0.2, 1.04, -1.4]]);
  });
  it("exports the three spare CRTs apart: none is a station, and none shares a place with one", () => {
    expect(spares.map((c) => c.id)).toEqual(["spare-work", "spare-home-lab", "spare-software-factory"]);
    for (const s of spares) {
      expect(stations.some((st) => st.id === s.id), s.id).toBe(false);
      expect(crts.some((c) => c.screen.join() === s.screen.join()), s.id).toBe(false);
    }
  });
  it("has no bench key any more, and no export of one", async () => {
    expect("bench" in layout).toBe(false);
    expect("bench" in (await import("./crts"))).toBe(false);
  });
  it("gives every TV the same glass", () => {
    expect(CRT_GLASS).toEqual({ width: 0.46, height: 0.36 });
  });
});

describe("the phosphor plane's corners", () => {
  const all = [...crts, ...spares];
  it("are the glass's corners moved SCREEN_LAYER out along the glass's normal, which faces the room", () => {
    for (const c of all) {
      const a = (c.yaw * Math.PI) / 180, n = [Math.sin(a), 0, Math.cos(a)];
      phosphorCorners(c).forEach((p, k) => {
        const g = glassCorners(c)[k];
        expect(p[0] - g[0], c.id).toBeCloseTo(n[0] * SCREEN_LAYER, 9);
        expect(p[1] - g[1], c.id).toBeCloseTo(0, 9);
        expect(p[2] - g[2], c.id).toBeCloseTo(n[2] * SCREEN_LAYER, 9);
      });
    }
  });
  it("with an inset, are that much narrower and shorter than the glass, still centred on the plane", () => {
    const c = crts[1], [bl, tl, br] = phosphorCorners(c, PLANE_INSET);
    expect(Math.hypot(br[0] - bl[0], br[2] - bl[2])).toBeCloseTo(CRT_GLASS.width - PLANE_INSET, 9);
    expect(tl[1] - bl[1]).toBeCloseTo(CRT_GLASS.height - PLANE_INSET, 9);
  });
});

// tools/room/build.py bakes the six TVs in `bakeOrder`. The order is today's physical one, so the random
// draws (a sticky note's colour, a keyboard's tilt) don't move. The re-bake ticket inherits this check.
describe("the bake order", () => {
  const all = [...layout.crts, ...layout.spares] as { id: string; screen: number[]; keyboard?: boolean }[];
  const baked = layout.bakeOrder.map((id) => all.find((c) => c.id === id)!);
  it("lists every TV once", () => {
    expect([...layout.bakeOrder].sort()).toEqual(all.map((c) => c.id).sort());
    expect(baked.every(Boolean)).toBe(true);
  });
  it("gives today's six screen positions in today's order: old Work CRT, MediaSafe CRT, Home lab CRT, bench TV, Software factory CRT, Contact CRT", () => {
    expect(baked.map((c) => c.screen)).toEqual([
      [-1.42, 1.04, -0.38], // the old Work CRT (a spare now)
      [-1.33, 1.04, -1.33], // the MediaSafe CRT (Work)
      [1.42, 1.28, -1.38], // the Home lab CRT (a spare)
      [1.42, 1.2, -0.18], // the bench TV (Projects)
      [1.42, 1.08, 1.38], // the Software factory CRT (a spare)
      [0.2, 1.04, -1.4], // the Contact CRT (About me)
    ]);
  });
  it("keeps the Home lab spare without a keyboard, and gives the rest one", () => {
    expect(baked.map((c) => c.keyboard)).toEqual([undefined, undefined, false, undefined, undefined, undefined]);
  });
});
