import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AUTHOR } from "./post-ci-failure.mjs";
import { LIMIT_SECONDS, TIMES_ISSUE_MARKER, TIMES_ISSUE_TITLE, retried, shouldWarn, warn, recordFacts } from "./release-clock.mjs";

// Playwright JSON report: a test has one result per attempt.
const result = (status) => ({ status, error: status === "passed" ? undefined : { message: "boom" } });
const t = (status, ...results) => ({ status, results: results.map(result) });
const reportOf = (...tests) => ({ suites: [{ title: "a.spec.ts", file: "a.spec.ts", specs: tests.map((x, i) => ({ title: `t${i}`, tests: [x] })), suites: [] }] });

describe("retried", () => {
  it("is true for a flaky test: failed, then passed", () => {
    expect(retried(reportOf(t("expected", "passed"), t("flaky", "failed", "passed")))).toBe(true);
  });
  it("is true for an unexpected test that was retried and failed again", () => {
    expect(retried(reportOf(t("unexpected", "failed", "failed")))).toBe(true);
  });
  it("is false for a clean run, and for a failure that was not retried", () => {
    expect(retried(reportOf(t("expected", "passed"), t("skipped")))).toBe(false);
    expect(retried(reportOf(t("unexpected", "failed")))).toBe(false);
    expect(retried({ suites: [] })).toBe(false);
  });
  it("finds a retried test in a nested suite", () => {
    const nested = { suites: [{ title: "a.spec.ts", file: "a.spec.ts", specs: [], suites: [{ title: "inner", specs: [{ title: "x", tests: [t("flaky", "failed", "passed")] }] }] }] };
    expect(retried(nested)).toBe(true);
  });
});

describe("shouldWarn", () => {
  it("the limit is 360 s", () => {
    expect(LIMIT_SECONDS).toBe(360);
  });
  // The one rule: warn exactly when staging moved, nothing was retried and the clock is over 360 s.
  const cases = [];
  for (const seconds of [0, 359, 360, 361, 3600])
    for (const wasRetried of [false, true])
      for (const moved of [false, true]) cases.push({ seconds, wasRetried, moved, warns: moved && !wasRetried && seconds > 360 });
  it.each(cases)("$seconds s, retried $wasRetried, moved $moved warns: $warns", ({ seconds, wasRetried, moved, warns }) => {
    expect(shouldWarn({ moved, retried: wasRetried, seconds })).toBe(warns);
  });
  it("warns in exactly one place across the sweep", () => {
    expect(cases.filter((c) => shouldWarn({ moved: c.moved, retried: c.wasRetried, seconds: c.seconds })).map((c) => c.seconds)).toEqual([361, 3600]);
  });
});

describe("recordFacts", () => {
  const dir = mkdtempSync(join(tmpdir(), "clock-"));
  const go = (rep, name) => {
    const output = join(dir, `out-${name}`);
    const report = join(dir, `report-${name}.json`);
    if (rep !== undefined) writeFileSync(report, typeof rep === "string" ? rep : JSON.stringify(rep));
    writeFileSync(output, "");
    recordFacts({ REPORT: report, GITHUB_OUTPUT: output });
    return readFileSync(output, "utf8");
  };
  it("writes retried=true and the load average for a retried run", () => {
    const text = go(reportOf(t("flaky", "failed", "passed")), "a");
    expect(text).toMatch(/^retried=true$/m);
    expect(text).toMatch(/^load=\d+\.\d\d \d+\.\d\d \d+\.\d\d$/m);
  });
  it("writes retried=false for a clean run", () => {
    expect(go(reportOf(t("expected", "passed")), "b")).toMatch(/^retried=false$/m);
  });
  it("writes no retried output when the report is missing or unreadable, and does not throw", () => {
    for (const [rep, name] of [[undefined, "c"], ["{cut off", "d"]]) expect(go(rep, name)).not.toMatch(/retried=/);
  });
});

describe("warn against a fake Forgejo", () => {
  let server;
  afterEach(() => server?.close());
  const standing = (extra = {}) => ({ number: 40, state: "open", body: `Standing.\n\n${TIMES_ISSUE_MARKER}`, user: { login: AUTHOR }, ...extra });
  // `started` is what the runs API returns. runStatus other than 200 makes that read fail.
  async function setup({ issues = [], started = "2026-11-16T05:46:32Z", runStatus = 200 } = {}) {
    const calls = [];
    const reads = [];
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        if (req.method === "POST" || req.method === "PATCH") {
          calls.push({ method: req.method, url: req.url.replace("/api/v1/repos/projects/lab", ""), body: JSON.parse(body) });
          return res.end(JSON.stringify({ number: 50 }));
        }
        reads.push(req.url);
        if (req.url.includes("/actions/runs/")) {
          res.statusCode = runStatus;
          return res.end(runStatus === 200 ? JSON.stringify({ id: 1184, started }) : "{}");
        }
        res.end(JSON.stringify(issues));
      });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const env = { SERVER_URL: `http://127.0.0.1:${server.address().port}`, REPOSITORY: "projects/lab", SHA: "abcdef1234", TOKEN: "tok", RUN_ID: "1184", RUN_NUMBER: "622" };
    const start = Date.parse("2026-11-16T05:46:32Z") / 1000;
    // Browser started 40 s into the run and staging ended 400 s into it: over the limit.
    const input = { moved: "true", retried: "false", browserStart: String(start + 40), imageStart: String(start + 35), ended: String(start + 400), load: "1.50 2.00 2.50" };
    return { calls, reads, env, input };
  }
  const quiet = async (fn) => {
    const lines = [];
    const spy = vi.spyOn(console, "log").mockImplementation((m) => lines.push(m));
    try { await fn(); } finally { spy.mockRestore(); }
    return lines.join("\n");
  };

  it("creates the standing issue when missing, then comments with the clock, load and runner wait", async () => {
    const s = await setup();
    await quiet(() => warn(s.input, s.env));
    expect(s.calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST /issues", "POST /issues/50/comments"]);
    expect(s.calls[0].body.title).toBe(TIMES_ISSUE_TITLE);
    expect(s.calls[0].body.title).toBe("Browser job times");
    expect(s.calls[0].body.body).toContain(TIMES_ISSUE_MARKER);
    const body = s.calls[1].body.body;
    expect(body).toContain("Release clock: 6m 40s (400 s)");
    expect(body).toContain("Browser job load average: 1.50 2.00 2.50");
    expect(body).toContain("Runner wait: 40 s");
    expect(body).toContain("/commit/abcdef1234");
    expect(body).toContain("/actions/runs/622");
    expect(s.reads.some((u) => u.endsWith("/api/v1/repos/projects/lab/actions/runs/1184"))).toBe(true);
  });
  it("reopens the standing issue when closed, then comments on it", async () => {
    const s = await setup({ issues: [standing({ state: "closed" })] });
    await quiet(() => warn(s.input, s.env));
    expect(s.calls.map((c) => `${c.method} ${c.url}`)).toEqual(["PATCH /issues/40", "POST /issues/40/comments"]);
    expect(s.calls[0].body).toEqual({ state: "open" });
  });
  it("comments on an open standing issue without creating another", async () => {
    const s = await setup({ issues: [standing()] });
    await quiet(() => warn(s.input, s.env));
    expect(s.calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST /issues/40/comments"]);
  });
  it("ignores a lookalike issue not made by CI", async () => {
    const s = await setup({ issues: [standing({ user: { login: "adham" } })] });
    await quiet(() => warn(s.input, s.env));
    expect(s.calls[0].url).toBe("/issues");
  });
  it.each([
    ["staging did not move", { moved: "false" }],
    ["a test was retried", { retried: "true" }],
    ["retried is unknown", { retried: "" }],
    ["the clock is exactly 360 s", { ended: String(Date.parse("2026-11-16T05:46:32Z") / 1000 + 360) }],
  ])("posts nothing when %s", async (_name, change) => {
    const s = await setup();
    await quiet(() => warn({ ...s.input, ...change }, s.env));
    expect(s.calls).toEqual([]);
  });

  it("a failed runs API read logs and does not throw; it then uses the earliest job start", async () => {
    const s = await setup({ runStatus: 403 });
    const log = await quiet(() => warn(s.input, s.env));
    expect(log).toMatch(/Could not read the run's start: .*HTTP 403/);
    // Earliest of image (+35) and browser (+40) is +35, so the clock is 365 s: over the limit.
    expect(s.calls[1].body.body).toContain("Release clock: 6m 5s (365 s)");
    expect(s.calls[1].body.body).toMatch(/earliest of the image and browser job starts/);
  });
  it("a failed runs API read with no job starts logs and posts nothing", async () => {
    const s = await setup({ runStatus: 403 });
    const log = await quiet(() => warn({ ...s.input, browserStart: "", imageStart: "" }, s.env));
    expect(log).toMatch(/no start time/i);
    expect(s.calls).toEqual([]);
  });
  it("a failed post logs and does not throw", async () => {
    const s = await setup();
    await new Promise((r) => server.close(r));
    server = undefined;
    const log = await quiet(() => warn(s.input, s.env));
    expect(log).toMatch(/Could not post the release clock warning/);
  });
  it("never puts the token in the log", async () => {
    const s = await setup({ runStatus: 500 });
    const log = await quiet(() => warn({ ...s.input, browserStart: "", imageStart: "" }, { ...s.env, TOKEN: "tok-planted" }));
    expect(log).not.toContain("tok-planted");
  });
  it("the script process exits 0 when the API is unreachable", async () => {
    const env = { ...process.env, SERVER_URL: "http://127.0.0.1:1", REPOSITORY: "projects/lab", TOKEN: "tok-xyz", RUN_ID: "1", MOVED: "true", RETRIED: "false", ENDED: "2000000000", BROWSER_START: "1" };
    const stdout = await new Promise((resolve, reject) =>
      execFile(process.execPath, [fileURLToPath(new URL("./release-clock.mjs", import.meta.url)), "warn"], { env }, (err, so) => (err ? reject(err) : resolve(so))));
    expect(stdout).toMatch(/Could not/);
  });
});
