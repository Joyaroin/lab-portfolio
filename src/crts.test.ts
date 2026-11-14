import { describe, it, expect } from "vitest";
import layout from "./room-layout.json" with { type: "json" };
import { crts, spares, CRT_GLASS } from "./crts";
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
