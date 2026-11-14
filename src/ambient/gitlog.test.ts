import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { gitlogRows, cutSubject, drawGitlog, LINE_HEIGHT, SUBJECT_MAX } from "./gitlog";
import { STILL_T } from "./still";
import type { SavedCommits } from "../commits";
import { ui } from "../content";
import { recordingContext } from "./recording-context.test-helper";

const saved: SavedCommits = JSON.parse(readFileSync(new URL("../commits-saved.json", import.meta.url), "utf8"));
const commits = saved.commits;
const shownTexts = (t: number) => gitlogRows(commits, t).map((r) => ({ hash: r.hash, subject: r.subject }));
const isCutFrom = (shown: string, full: string) => shown === full || (shown.endsWith("…") && full.startsWith(shown.slice(0, -1)));

describe("gitlogRows", () => {
  it("shows about ten lines", () => {
    for (const t of [0, 5000, STILL_T, 123456]) {
      const n = gitlogRows(commits, t).length;
      expect(n).toBeGreaterThanOrEqual(9);
      expect(n).toBeLessThanOrEqual(12);
    }
  });
  it("only shows a hash and subject that a commit in the commits file has", () => {
    for (let t = 0; t < 400_000; t += 7919) {
      for (const r of gitlogRows(commits, t)) {
        const c = commits.find((x) => x.sha7 === r.hash);
        expect(c, `hash ${r.hash} at ${t}`).toBeDefined();
        expect(isCutFrom(r.subject, c!.subject), r.subject).toBe(true);
      }
    }
  });
  it("fits every line on one: the hash, a space and a subject of at most 23 characters", () => {
    for (const c of commits) expect(cutSubject(c.subject).length).toBeLessThanOrEqual(SUBJECT_MAX + 1);
    expect(commits.some((c) => c.subject.length > SUBJECT_MAX + 1)).toBe(true); // the file does have long ones
    for (const r of gitlogRows(commits, STILL_T)) expect(r.subject).not.toContain("\n");
  });
  it("cuts a long subject with an ellipsis and leaves a short one alone", () => {
    expect(cutSubject("Short one")).toBe("Short one");
    expect(cutSubject("x".repeat(SUBJECT_MAX + 1))).toBe("x".repeat(SUBJECT_MAX + 1));
    expect(cutSubject("Every station has pages, the walk order is a pure module")).toBe("Every station has page…");
    expect(cutSubject("word ".repeat(10))).toMatch(/[^ ]…$/);
  });
  it("shows the newest commits at the top in the still frame", () => {
    const rows = gitlogRows(commits, STILL_T);
    expect(rows.slice(0, 3).map((r) => r.hash)).toEqual(commits.slice(0, 3).map((c) => c.sha7));
    expect(rows[0].y).toBe(70);
  });
  it("scrolls up as time passes", () => {
    const a = gitlogRows(commits, STILL_T)[0];
    const b = gitlogRows(commits, STILL_T + 900).find((r) => r.hash === a.hash)!;
    expect(b.y).toBeLessThan(a.y);
    expect(a.y - b.y).toBeCloseTo(10, 5);
  });
  it("wraps: after one whole list of scrolling it is where it began, and the first commit follows the last", () => {
    const loop = commits.length * LINE_HEIGHT * 90;
    expect(shownTexts(STILL_T + loop)).toEqual(shownTexts(STILL_T));
    expect(shownTexts(STILL_T + 3 * loop + 4000)).toEqual(shownTexts(STILL_T + 4000));
    // just before the loop ends the oldest commit is on the glass, with the newest right after it
    const rows = gitlogRows(commits, STILL_T + loop - 2000);
    const i = rows.findIndex((r) => r.hash === commits[commits.length - 1].sha7);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(rows[i + 1].hash).toBe(commits[0].sha7);
  });
  it("works for a time before the still frame, and for a short or empty list", () => {
    expect(gitlogRows(commits, 0).length).toBeGreaterThan(0);
    expect(gitlogRows([], 5000)).toEqual([]);
    const two = commits.slice(0, 2);
    expect(gitlogRows(two, 5000).length).toBeGreaterThan(2); // wraps to fill the glass
  });
});

describe("drawGitlog", () => {
  it("draws the command line and the lines of the still frame", () => {
    const { ctx, texts } = recordingContext();
    drawGitlog(ctx, STILL_T, commits);
    expect(texts[0]).toBe(ui.ambient.gitlogCommand);
    expect(texts).toContain(commits[0].sha7);
    expect(texts).toContain(cutSubject(commits[0].subject));
  });
});
