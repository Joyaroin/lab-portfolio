import { describe, it, expect } from "vitest";
import { noteStyleFor } from "./notes";
import { stations } from "./content";

describe("sticky notes", () => {
  it("Work takes the colour and tilt of the CRT that was MediaSafe's, and About me of the one that was Contact's", () => {
    expect(noteStyleFor("work")).toEqual({ colour: "#f2a6b8", tilt: 0.02 });
    expect(noteStyleFor("about")).toEqual({ colour: "#d3b8f0", tilt: -0.01 });
  });
  it("Projects has a colour and tilt of its own", () => {
    const projects = noteStyleFor("projects");
    for (const old of [{ colour: "#f4e27a", tilt: -0.06 }, { colour: "#f2a6b8", tilt: 0.02 }, { colour: "#9fd8f0", tilt: 0.05 },
      { colour: "#f7c68b", tilt: 0.06 }, { colour: "#d3b8f0", tilt: -0.01 }]) {
      expect(projects.colour).not.toBe(old.colour);
      expect(projects.tilt).not.toBe(old.tilt);
    }
  });
  it("every station has its own colour and its own tilt", () => {
    const styles = stations.map((s) => noteStyleFor(s.id));
    expect(new Set(styles.map((n) => n.colour)).size).toBe(stations.length);
    expect(new Set(styles.map((n) => n.tilt)).size).toBe(stations.length);
  });
  it("throws for an id that is no station", () => {
    expect(() => noteStyleFor("mediasafe")).toThrow();
  });
});
