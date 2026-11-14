import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { STILL_T, wrap } from "./still";
import { gitlogRows } from "./gitlog";
import { trafficDots } from "./traffic";
import { puzzleFrame } from "./puzzle";
import type { SavedCommits } from "../commits";

// The still frame (phones and reduced motion) is one time for all three screens.
describe("STILL_T", () => {
  const { commits }: SavedCommits = JSON.parse(readFileSync(new URL("../commits-saved.json", import.meta.url), "utf8"));
  it("puts the newest commits at the top of the git log", () => {
    expect(gitlogRows(commits, STILL_T)[0]).toMatchObject({ hash: commits[0].sha7, y: 70 });
  });
  it("puts the traffic dots in place on the path", () => {
    const dots = trafficDots(STILL_T);
    expect(dots.length).toBeGreaterThan(0);
    expect(dots.some((d) => d.alpha > 0.3)).toBe(true);
  });
  it("shows SECURE solved in the puzzle", () => {
    expect(puzzleFrame(STILL_T)).toMatchObject({ word: "SECURE", text: "SECURE", solved: true });
  });
  it("gives every frame the same answer each time it is asked", () => {
    expect(gitlogRows(commits, STILL_T)).toEqual(gitlogRows(commits, STILL_T));
    expect(trafficDots(STILL_T)).toEqual(trafficDots(STILL_T));
    expect(puzzleFrame(STILL_T)).toEqual(puzzleFrame(STILL_T));
  });
});

describe("wrap", () => {
  it("keeps a number in 0..b, whatever its sign", () => {
    expect(wrap(7, 5)).toBe(2);
    expect(wrap(-1, 5)).toBe(4);
    expect(wrap(10, 5)).toBe(0);
  });
});
