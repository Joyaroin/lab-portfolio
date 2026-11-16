import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AUTHOR, ISSUE_MARKER, markerFor } from "./post-ci-failure.mjs";
import { main, measure, reportMarkerFor } from "./browser-report.mjs";

// Fixture Playwright JSON reports, in the shape `--reporter=json` writes.
const attempt = (duration, { error, boot } = {}) => ({
  duration, error: error && { message: error }, annotations: boot === undefined ? [] : [{ type: "boot-ms", description: String(boot) }],
});
const spec = (title, status, results) => ({ title, tests: [{ status, annotations: [], results }] });
const reportOf = (specs) => ({ suites: [{ title: "room.spec.ts", file: "room.spec.ts", specs }] });

// 12 tests: boots 1000, 2000, 3000, 4000 (median 2500, total 10000) on four of them, one flaky with a first error.
const passing = reportOf([
  ...Array.from({ length: 8 }, (_, i) => spec(`quick ${i}`, "expected", [attempt(100 + i)])),
  spec("a", "expected", [attempt(9000, { boot: 1000 })]),
  spec("b", "expected", [attempt(8000, { boot: 2000 })]),
  spec("c", "expected", [attempt(7000, { boot: 3000 })]),
  { title: "flaker", tests: [{ status: "flaky", annotations: [], results: [attempt(500, { error: "\u001b[31mExpected: 1\u001b[39m\nReceived: 2" }), attempt(6000, { boot: 4000 })] }] },
]);
const failing = reportOf([
  spec("broken", "unexpected", [attempt(10, { error: "boom" }), attempt(10, { error: "boom again" })]),
  ...passing.suites[0].specs.slice(-1),
]);
const clean = reportOf([spec("a", "expected", [attempt(100, { boot: 900 })])]);

describe("measure", () => {
  it("ranks the slowest tests, adding a test's attempts up", () => {
    const { slowest } = measure(passing);
    expect(slowest).toHaveLength(10);
    expect(slowest.map((t) => t.ms).slice(0, 4)).toEqual([9000, 8000, 7000, 6500]);
    expect(slowest[0].name).toBe("room.spec.ts > a");
  });
  it("takes the median and total of annotated tests only, and counts them", () => {
    expect(measure(passing).boot).toEqual({ tests: 4, all: 12, median: 2500, total: 10000 });
  });
  it("adds a test's boots up when it called openTour twice", () => {
    const r = reportOf([{ title: "twice", tests: [{ status: "expected", results: [{ duration: 1, annotations: [{ type: "boot-ms", description: "100" }, { type: "boot-ms", description: "300" }] }] }] }]);
    expect(measure(r).boot).toMatchObject({ tests: 1, median: 400, total: 400 });
  });
  it("ignores other annotations and unreadable values", () => {
    const r = reportOf([{ title: "x", tests: [{ status: "expected", results: [{ duration: 1, annotations: [{ type: "snap-back-ms", description: "5" }, { type: "boot-ms", description: "oops" }] }] }] }]);
    expect(measure(r).boot).toMatchObject({ tests: 0, median: undefined, total: 0 });
  });
  it("leaves skipped tests out", () => {
    expect(measure(reportOf([spec("s", "skipped", [])])).boot.all).toBe(0);
  });
});

describe("main against a fake Forgejo", () => {
  let server;
  afterEach(() => server?.close());
  /** `comments` is what the PR already has, `issues` what the standing-issue search returns. POST and PATCH are recorded. */
  async function setup({ prs = [], comments = [], issues = [], rep = passing, branch = "ticket-66", outcome = "success" } = {}) {
    const calls = [];
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        if (req.method === "POST" || req.method === "PATCH") {
          calls.push({ method: req.method, url: req.url.replace("/api/v1/repos/projects/lab", ""), body: JSON.parse(body) });
          return res.end(JSON.stringify({ number: 50 }));
        }
        res.end(JSON.stringify(req.url.includes("/comments") ? comments : req.url.includes("/issues") ? issues : prs));
      });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const dir = mkdtempSync(join(tmpdir(), "report-"));
    const report = join(dir, "r.json");
    const startFile = join(dir, "start");
    if (rep) writeFileSync(report, JSON.stringify(rep));
    writeFileSync(startFile, "1000\n");
    const env = { SERVER_URL: `http://127.0.0.1:${server.address().port}`, REPOSITORY: "projects/lab", BRANCH: branch, SHA: "abcdef1234", TOKEN: "t", RUN_NUMBER: "812" };
    const input = { job: "browser", outcome, report, startFile, secrets: [], now: 1_000_000 + 1_000 * 392 };
    return { calls, env, input, dir, run: () => main(input, env) };
  }
  const pr = { number: 7, head: { ref: "ticket-66", repo: { full_name: "projects/lab" } } };
  const earlierReport = { id: 12, body: `old\n\n${reportMarkerFor("browser")}`, user: { login: AUTHOR } };
  const standing = { number: 40, state: "open", body: `Standing.\n\n${ISSUE_MARKER}`, user: { login: AUTHOR } };

  describe("on a PR", () => {
    it("shows the job's time, the load, the flaky test with its first error, the 10 slowest and the boot median and total", async () => {
      const t = await setup({ prs: [pr] });
      await t.run();
      expect(t.calls).toHaveLength(1);
      expect(t.calls[0]).toMatchObject({ method: "POST", url: "/issues/7/comments" });
      const body = t.calls[0].body.body;
      expect(body).toContain("Took: 6m 32s"); // started at 1000 s, now 1392 s
      expect(body).toMatch(/Load average: \d+\.\d\d \d+\.\d\d \d+\.\d\d/);
      expect(body).toContain("1 flaky test(s), passed on a retry:");
      expect(body).toContain("**flaker**");
      expect(body).toContain("Expected: 1\nReceived: 2");
      expect(body).not.toContain("\u001b");
      expect(body).toContain("The 10 slowest tests:");
      expect(body.match(/^\| room\.spec\.ts > /gm)).toHaveLength(10);
      expect(body.indexOf("room.spec.ts > a |")).toBeLessThan(body.indexOf("room.spec.ts > b |"));
      expect(body).toContain("4 of 12 tests");
      expect(body).toContain("median 2.5 s, total 10.0 s");
      expect(body).toContain("a test that never calls openTour isn't measured");
      expect(body.endsWith(reportMarkerFor("browser"))).toBe(true);
    });
    it("the first line is not a word merge-pr reads as a verdict", async () => {
      const t = await setup({ prs: [pr] });
      await t.run();
      expect(t.calls[0].body.body.split("\n")[0]).toBe("CI browser job report for abcdef1");
    });
    it("a second run updates the same comment and adds no new one", async () => {
      const t = await setup({ prs: [pr], comments: [{ id: 11, body: "someone else", user: { login: "adham" } }, earlierReport] });
      await t.run();
      expect(t.calls).toHaveLength(1);
      expect(t.calls[0]).toMatchObject({ method: "PATCH", url: "/issues/comments/12" });
      expect(t.calls[0].body.body).toContain("CI browser job report for abcdef1");
    });
    it("ignores a comment that only quotes the marker, and the failure comment", async () => {
      const comments = [
        { id: 13, body: `> ${reportMarkerFor("browser")}`, user: { login: "adham" } },
        { id: 14, body: `why\n\n${markerFor("browser")}`, user: { login: AUTHOR } },
      ];
      const t = await setup({ prs: [pr], comments });
      await t.run();
      expect(t.calls[0].method).toBe("POST");
    });
    it("says no flaky test when there was none, and no boot time when nothing was annotated", async () => {
      const t = await setup({ prs: [pr], rep: reportOf([spec("a", "expected", [attempt(100)])]) });
      await t.run();
      expect(t.calls[0].body.body).toContain("Flaky tests: none.");
      expect(t.calls[0].body.body).toContain("no test recorded a boot-ms annotation (1 tests ran)");
    });
    it("still reports time and load when the Playwright report is missing", async () => {
      const t = await setup({ prs: [pr], rep: null });
      await t.run();
      expect(t.calls[0].body.body).toContain("Took:");
      expect(t.calls[0].body.body).toContain("No Playwright report was readable");
    });
    it("a failure updates the comment to say the run failed and links the failure comment", async () => {
      const failure = { id: 15, body: `CI browser job output\n\n${markerFor("browser")}`, user: { login: AUTHOR } };
      const t = await setup({ prs: [pr], comments: [earlierReport, failure], rep: failing, outcome: "failure" });
      await t.run();
      expect(t.calls).toHaveLength(1);
      expect(t.calls[0]).toMatchObject({ method: "PATCH", url: "/issues/comments/12" });
      const body = t.calls[0].body.body;
      expect(body).toContain("run failed");
      expect(body).toContain(`${t.env.SERVER_URL}/projects/lab/pulls/7#issuecomment-15`);
      expect(body).not.toContain("slowest");
      expect(body.endsWith(reportMarkerFor("browser"))).toBe(true);
    });
    it("a failure with no failure comment still says the run failed", async () => {
      const t = await setup({ prs: [pr], outcome: "failure" });
      await t.run();
      expect(t.calls[0].body.body).toContain("run failed");
      expect(t.calls[0].body.body).toContain("No failure comment was found");
    });
    it("posts nothing without an open PR on another branch", async () => {
      const t = await setup({ prs: [] });
      await t.run();
      expect(t.calls).toEqual([]);
    });
    it("posts nothing when the run step was skipped or cancelled", async () => {
      for (const outcome of ["skipped", "cancelled", ""]) {
        const t = await setup({ prs: [pr], outcome });
        await t.run();
        expect(t.calls).toEqual([]);
        server.close();
      }
    });
    it("masks a planted secret", async () => {
      const planted = ["s3cr3t", "value"].join("-");
      const rep = reportOf([{ title: "f", tests: [{ status: "flaky", results: [attempt(5, { error: `bad ${planted}` }), attempt(5)] }] }]);
      const t = await setup({ prs: [pr], rep });
      t.input.secrets = [planted];
      await t.run();
      expect(JSON.stringify(t.calls)).not.toContain(planted);
      expect(t.calls[0].body.body).toContain("bad ***");
    });
  });

  describe("on main", () => {
    const onMain = (o = {}) => setup({ branch: "main", ...o });
    it("a pass with a flaky test makes one comment on the standing issue", async () => {
      const t = await onMain({ issues: [standing] });
      await t.run();
      expect(t.calls).toHaveLength(1);
      expect(t.calls[0]).toMatchObject({ method: "POST", url: "/issues/40/comments" });
      const body = t.calls[0].body.body;
      expect(body).toContain("/commit/abcdef1234");
      expect(body).toContain("/actions/runs/812");
      expect(body).toContain("flaker");
      expect(body).toContain("Expected: 1\nReceived: 2");
      expect(body).not.toContain("slowest");
    });
    it("creates the issue first when it is missing", async () => {
      const t = await onMain();
      await t.run();
      expect(t.calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST /issues", "POST /issues/50/comments"]);
      expect(t.calls[0].body.title).toBe("CI failures on main");
    });
    it("a clean pass makes no API write", async () => {
      const t = await onMain({ rep: clean, issues: [standing] });
      await t.run();
      expect(t.calls).toEqual([]);
    });
    it("a pass with no readable report makes no API write", async () => {
      const t = await onMain({ rep: null });
      await t.run();
      expect(t.calls).toEqual([]);
    });
    it("a failure makes no API write: the failure comment carries the flaky tests", async () => {
      const t = await onMain({ rep: failing, outcome: "failure", issues: [standing] });
      await t.run();
      expect(t.calls).toEqual([]);
    });
  });
});
