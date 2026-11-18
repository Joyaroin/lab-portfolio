import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AUTHOR, cli, findingsFrom, failedTests, flakyTests, failedStep, formatComment, main, markerFor, MARKER, ISSUE_MARKER } from "./post-ci-failure.mjs";

const test = (status, message) => ({ status, results: [{ error: message && { message } }] });
const report = {
  suites: [
    {
      title: "room.spec.ts", file: "room.spec.ts",
      specs: [
        { title: "meter shows", tests: [test("expected")] },
        { title: "HUD appears", tests: [test("unexpected", "\u001b[31mExpected: 1\u001b[39m\nReceived: 2")] },
      ],
      suites: [{ title: "tour", specs: [{ title: "stops", tests: [test("unexpected", "boom")] }] }],
    },
  ],
};

describe("failedTests", () => {
  it("lists only failed tests, with plain-text errors", () => {
    expect(failedTests(report)).toEqual([
      { name: "HUD appears", error: "Expected: 1\nReceived: 2" },
      { name: "tour > stops", error: "boom" },
    ]);
  });
  it("finds nothing in a passing report", () => {
    expect(failedTests({ suites: [{ title: "a", file: "a", specs: [{ title: "x", tests: [test("expected")] }] }] })).toEqual([]);
  });
});

const flakyReport = {
  suites: [{
    title: "room.spec.ts", file: "room.spec.ts",
    specs: [
      { title: "wheel moves nothing", tests: [{ status: "flaky", results: [{ status: "failed", error: { message: "\u001b[31mfirst try\u001b[39m" } }, { status: "passed" }] }] },
      { title: "HUD appears", tests: [test("unexpected", "broke")] },
      { title: "meter shows", tests: [test("expected")] },
    ],
  }],
};

describe("flakyTests", () => {
  it("lists only tests that passed on a retry, with the first attempt's error", () => {
    expect(flakyTests(flakyReport)).toEqual([{ name: "wheel moves nothing", error: "first try" }]);
  });
  it("never counts a flaky test as failed", () => {
    expect(failedTests(flakyReport).map((t) => t.name)).toEqual(["HUD appears"]);
  });
});

const JOBS = ["frontend", "backend", "integration", "browser"];
const ALL_JOBS = [...JOBS, "secret-scan"];
const base = { sha: "abcdef1234", step: "run", cmd: "make frontend", exit: "2", seconds: 125, load: [0.5, 1, 1.5] };
const out = Array.from({ length: 60 }, (_, i) => (i === 3 ? "src/a.ts: TypeError: bad" : `line ${i}`)).join("\n");

describe("formatComment", () => {
  it.each(JOBS)("%s builds a comment with its own marker and every listed item", (job) => {
    const body = formatComment({ ...base, job, out });
    expect(body.endsWith(markerFor(job))).toBe(true);
    for (const other of JOBS.filter((j) => j !== job)) expect(body).not.toContain(markerFor(other));
    expect(body).toContain(`Job: ${job}`);
    expect(body).toContain("Failed step: run");
    expect(body).toContain("`make frontend` exited with code 2");
    expect(body).toContain("First error line: `src/a.ts: TypeError: bad`");
    expect(body).toContain("line 59");
    expect(body).toContain("line 20");
    expect(body).not.toContain("line 19\n");
    expect(body).toContain("Took: 2m 5s");
    expect(body).toContain("Load average: 0.50 1.00 1.50");
  });
  it("keeps the old browser marker", () => {
    expect(MARKER).toBe("<!-- ci-browser-failure -->");
  });
  it.each(ALL_JOBS)("%s comment does not start with a word merge-pr reads as a verdict", (job) => {
    const first = formatComment({ ...base, job, out }).split("\n")[0];
    expect(first).toBe(`CI ${job} job output for abcdef1`);
    expect(first).not.toMatch(/^\s*(verdict|pass|fail|rebuild)/i);
  });
  it.each(["download", "checksum"])("secret-scan %s comment does not start with a verdict word", (step) => {
    const first = formatComment({ ...base, job: "secret-scan", step, out: undefined }).split("\n")[0];
    expect(first).not.toMatch(/^\s*(verdict|pass|fail|rebuild)/i);
  });
  it("uses the failed tests as the browser error", () => {
    const body = formatComment({ ...base, job: "browser", out, tests: failedTests(report) });
    expect(body).toMatch(/HUD appears/);
    expect(body).toMatch(/Expected: 1/);
    expect(body).not.toContain("exited with code");
  });
  it("leaves out the error line when nothing matches", () => {
    const body = formatComment({ ...base, job: "frontend", out: "all fine\nbut exit 1" });
    expect(body).not.toContain("First error line");
  });
  it("says so when a step produced no output", () => {
    const body = formatComment({ ...base, job: "frontend", step: "checkout", out: undefined });
    expect(body).toContain("Failed step: checkout");
    expect(body).toContain("no output captured");
  });
  it("cuts long errors and long lists", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `t${i}`, error: "x".repeat(5000) }));
    const body = formatComment({ ...base, job: "browser", tests: many });
    expect(body.length).toBeLessThan(20000);
    expect(body).toMatch(/and 20 more/);
  });
});

// What gitleaks 8.30.1 --redact writes per finding. Match and Secret hold REDACTED; the commit fields are never read.
const LEAK = {
  RuleID: "aws-access-token", Description: "AWS key", File: "src/a.ts", StartLine: 7, Commit: "1234567890abcdef",
  Match: "key = REDACTED", Secret: "REDACTED", Author: "Some One", Email: "someone@example.test", Message: "oops a commit message",
};
const scanBase = { job: "secret-scan", sha: "abcdef1234", step: "scan", cmd: "gitleaks git", exit: "1", seconds: 65, load: [0.5, 1, 1.5] };
const items = (body, job = "secret-scan") => {
  expect(body.endsWith(markerFor(job))).toBe(true);
  expect(body).toContain(`Job: ${job}`);
  expect(body).toContain("Took: 1m 5s");
  expect(body).toContain("Load average: 0.50 1.00 1.50");
  expect(body).not.toMatch(/lines of output/);
  expect(body).not.toContain("~~~");
};

describe("secret-scan comment", () => {
  it("uses only the redacted report's rule, file, line and commit", () => {
    expect(findingsFrom(JSON.stringify([LEAK]))).toEqual([{ rule: "aws-access-token", file: "src/a.ts", line: 7, commit: "1234567" }]);
    const body = formatComment({ ...scanBase, findings: findingsFrom(JSON.stringify([LEAK])) });
    for (const v of ["REDACTED", "Some One", "someone@example.test", "oops a commit message", "key ="]) expect(body).not.toContain(v);
  });
  it("findings version carries its marker and every item", () => {
    const body = formatComment({ ...scanBase, findings: findingsFrom(JSON.stringify([LEAK])) });
    items(body);
    expect(body).toContain("Failed step: scan");
    expect(body).toContain("`aws-access-token` in `src/a.ts:7`, commit `1234567`");
  });
  it.each(["download", "checksum"])("%s version has the step and exit code but no findings", (step) => {
    const body = formatComment({ ...scanBase, step, exit: "22" });
    items(body);
    expect(body).toContain(`Failed step: ${step}`);
    expect(body).toContain(`step ${step} failed with exit code 22`);
    expect(body).not.toContain("possible secret");
  });
  it.each([["[]"], [""], [undefined]])("a scan failure with report %j uses the no-findings shape", (text) => {
    const body = formatComment({ ...scanBase, findings: findingsFrom(text) });
    items(body);
    expect(body).toContain("step scan failed with exit code 1");
    expect(body).not.toContain("possible secret");
  });
  it("cuts a long list", () => {
    const body = formatComment({ ...scanBase, findings: findingsFrom(JSON.stringify(Array(30).fill(LEAK))) });
    expect(body).toContain("and 10 more");
  });
});

describe("failedStep", () => {
  it("names the first step that did not succeed", () => {
    expect(failedStep("start=success checkout=failure run=skipped")).toBe("checkout");
    expect(failedStep("start=success checkout=success run=failure")).toBe("run");
  });
});

describe("main against a fake Forgejo", () => {
  let server;
  afterEach(() => server?.close());
  // `comments` is what the PR already has. POST adds to it and PATCH changes one, as Forgejo does.
  const NOOUT = "boom: Error here\nmore";
  async function run(prs, { comments = [], job = "browser", rep = report, output = NOOUT, status = 200, secrets = [], issues = [], branch = "ticket-66" } = {}) {
    const calls = [];
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        if (status !== 200) { res.statusCode = status; return res.end("{}"); }
        if (req.method === "POST" || req.method === "PATCH") {
          calls.push({ method: req.method, url: req.url, body: JSON.parse(body) });
          return res.end(JSON.stringify({ number: 50 }));
        }
        const list = req.url.includes("/comments") ? comments : req.url.includes("/issues") ? issues : prs;
        res.end(JSON.stringify(list));
      });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const dir = mkdtempSync(join(tmpdir(), "pw-"));
    const files = { report: join(dir, "r.json"), outFile: join(dir, "out.log"), exitFile: join(dir, "exit"), startFile: join(dir, "start") };
    if (rep) writeFileSync(files.report, JSON.stringify(rep));
    if (output !== null) writeFileSync(files.outFile, output);
    writeFileSync(files.exitFile, "3\n");
    writeFileSync(files.startFile, "1000\n");
    const env = { SERVER_URL: `http://127.0.0.1:${server.address().port}`, REPOSITORY: "projects/lab", BRANCH: branch, SHA: "abcdef1234", TOKEN: "t" };
    const input = { job, steps: "start=success checkout=success run=failure", runStep: "run", cmd: `make ${job}`, ...files, secrets, now: 1090000 };
    return { calls, env, input, dir, run: () => main(input, env) };
  }
  const pr = (n, ref) => ({ number: n, head: { ref, repo: { full_name: "projects/lab" } } });

  it("comments on the PR for the branch", async () => {
    const t = await run([pr(5, "other"), pr(7, "ticket-66")]);
    await t.run();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].method).toBe("POST");
    expect(t.calls[0].url).toBe("/api/v1/repos/projects/lab/issues/7/comments");
    expect(t.calls[0].body.body).toMatch(/HUD appears/);
    expect(t.calls[0].body.body).toContain(MARKER);
    expect(t.calls[0].body.body).toContain("Took: 1m 30s");
  });
  it("updates its earlier comment on a second failure and adds no new one", async () => {
    const earlier = [
      { id: 11, body: "someone else", user: { login: "adham" } },
      { id: 12, body: `CI browser job output for 1111111\n\n${MARKER}`, user: { login: AUTHOR } },
    ];
    const t = await run([pr(7, "ticket-66")], { comments: earlier });
    await t.run();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].method).toBe("PATCH");
    expect(t.calls[0].url).toBe("/api/v1/repos/projects/lab/issues/comments/12");
    expect(t.calls[0].body.body).toMatch(/for abcdef1/);
  });
  it("does not touch another job's comment", async () => {
    const earlier = [{ id: 12, body: `x\n\n${markerFor("frontend")}`, user: { login: AUTHOR } }];
    const t = await run([pr(7, "ticket-66")], { comments: earlier, job: "backend" });
    await t.run();
    expect(t.calls[0].method).toBe("POST");
    expect(t.calls[0].body.body).toContain(markerFor("backend"));
  });
  it("leaves alone a comment that only quotes the marker", async () => {
    const quote = [{ id: 13, body: `> ${MARKER}\nwhy is this here?`, user: { login: "adham" } }];
    const t = await run([pr(7, "ticket-66")], { comments: quote });
    await t.run();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].method).toBe("POST");
  });
  it("posts nothing without an open PR", async () => {
    const t = await run([pr(5, "other")]);
    await t.run();
    expect(t.calls).toEqual([]);
  });
  describe("main with no PR", () => {
    const mainRun = (o = {}) => run([pr(5, "other")], { branch: "main", ...o });
    const standing = (extra = {}) => ({ number: 40, state: "open", body: `Standing.\n\n${ISSUE_MARKER}`, user: { login: AUTHOR }, ...extra });
    it("creates the issue and comments on it", async () => {
      const t = await mainRun();
      t.env.RUN_NUMBER = "812";
      await t.run();
      expect(t.calls.map((c) => `${c.method} ${c.url.replace("/api/v1/repos/projects/lab", "")}`)).toEqual(["POST /issues", "POST /issues/50/comments"]);
      expect(t.calls[0].body.title).toBe("CI failures on main");
      expect(t.calls[0].body.body).toContain(ISSUE_MARKER);
      expect(t.calls[1].body.body).toMatch(/HUD appears/);
      expect(t.calls[1].body.body).toContain("/commit/abcdef1234");
      expect(t.calls[1].body.body).toContain("/actions/runs/812");
    });
    it("adds a new comment to an open issue, never editing an earlier one", async () => {
      const t = await mainRun({ issues: [standing()], comments: [{ id: 3, body: markerFor("browser"), user: { login: AUTHOR } }] });
      await t.run();
      expect(t.calls).toHaveLength(1);
      expect(t.calls[0].method).toBe("POST");
      expect(t.calls[0].url).toMatch(/issues\/40\/comments$/);
    });
    it("reopens a closed issue, then comments", async () => {
      const t = await mainRun({ issues: [standing({ state: "closed" })] });
      await t.run();
      expect(t.calls.map((c) => c.method)).toEqual(["PATCH", "POST"]);
      expect(t.calls[0].url).toMatch(/issues\/40$/);
      expect(t.calls[0].body).toEqual({ state: "open" });
    });
    it("ignores a lookalike issue not made by CI", async () => {
      const t = await mainRun({ issues: [standing({ user: { login: "adham" } })] });
      await t.run();
      expect(t.calls[0].url).toMatch(/\/issues$/);
    });
    it("posts nothing for another branch without a PR", async () => {
      const t = await run([pr(5, "other")], { branch: "ticket-66" });
      await t.run();
      expect(t.calls).toEqual([]);
    });
    it("masks secrets on the issue path", async () => {
      const planted = ["s3cr3t", "value"].join("-");
      const t = await mainRun({ job: "frontend", rep: null, output: `Error: ${planted}`, secrets: [planted] });
      await t.run();
      expect(JSON.stringify(t.calls)).not.toContain(planted);
      expect(t.calls[1].body.body).toContain("Error: ***");
    });
  });
  it("a failure comment names the run's flaky tests and counts only the failed ones", async () => {
    const t = await run([pr(7, "ticket-66")], { rep: flakyReport });
    await t.run();
    const body = t.calls[0].body.body;
    expect(body).toContain("1 browser test(s) did not pass");
    expect(body).toContain("**HUD appears**");
    expect(body).toContain("1 flaky test(s), passed on a retry:");
    expect(body).toContain("**wheel moves nothing**");
    expect(body).toContain("first try");
  });
  it("a failure comment on main carries the flaky tests too", async () => {
    const t = await run([pr(5, "other")], { rep: flakyReport, branch: "main" });
    await t.run();
    expect(t.calls[1].body.body).toContain("**wheel moves nothing**");
  });
  describe("many flaky tests", () => {
    const flakyAttempt = (msg) => ({ status: "failed", error: { message: msg } });
    const manyFlaky = (n, msg = (i) => `first try ${i}`) => ({
      suites: [{ title: "room.spec.ts", file: "room.spec.ts", specs: [
        { title: "HUD appears", tests: [test("unexpected", "broke")] },
        ...Array.from({ length: n }, (_, i) => ({ title: `t${i}`, tests: [{ status: "flaky", results: [flakyAttempt(msg(i)), { status: "passed" }] }] })),
      ] }],
    });
    it("a failure comment names every flaky test, with an error on the first 10 only", async () => {
      const t = await run([pr(7, "ticket-66")], { rep: manyFlaky(12) });
      await t.run();
      const body = t.calls[0].body.body;
      expect(body).toContain("12 flaky test(s), passed on a retry:");
      for (let i = 0; i < 12; i++) expect(body).toContain(`**t${i}**`);
      for (let i = 0; i < 10; i++) expect(body).toContain(`first try ${i}`);
      expect(body).not.toContain("first try 10");
      expect(body).not.toContain("first try 11");
      expect(body).not.toMatch(/and \d+ more/);
    });
    it("a failure comment cuts a 700-character flaky error at 600", async () => {
      const t = await run([pr(7, "ticket-66")], { rep: manyFlaky(1, () => "x".repeat(700)) });
      await t.run();
      const body = t.calls[0].body.body;
      expect(body).toContain("x".repeat(600) + "\n… (cut)");
      expect(body).not.toContain("x".repeat(601));
    });
  });
  it("a failure comment without flaky tests has no flaky section", async () => {
    const t = await run([pr(7, "ticket-66")]);
    await t.run();
    expect(t.calls[0].body.body).not.toContain("flaky");
  });
  it("browser falls back to the command and exit code when there is no report", async () => {
    const t = await run([pr(7, "ticket-66")], { rep: null });
    await t.run();
    const body = t.calls[0].body.body;
    expect(body).toContain("`make browser` exited with code 3");
    expect(body).toContain("First error line: `boom: Error here`");
  });
  it("browser falls back when the report has no failed test", async () => {
    const t = await run([pr(7, "ticket-66")], { rep: { suites: [] } });
    await t.run();
    expect(t.calls[0].body.body).toContain("`make browser` exited with code 3");
  });
  it("says no output captured when the failing step saved none", async () => {
    const t = await run([pr(7, "ticket-66")], { job: "frontend", rep: null, output: null });
    t.input.steps = "start=success checkout=failure run=skipped";
    await t.run();
    const body = t.calls[0].body.body;
    expect(body).toContain("Failed step: checkout");
    expect(body).toContain("no output captured");
  });
  describe("secret-scan end to end", () => {
    const go = async ({ steps, reportText, comments = [] }) => {
      const t = await run([pr(7, "ticket-66")], { job: "secret-scan", rep: null, output: null, comments });
      const leaks = join(t.dir, "leaks.json");
      if (reportText !== undefined) writeFileSync(leaks, reportText);
      Object.assign(t.input, { steps, runStep: "scan", leaksReport: leaks });
      await t.run();
      return t.calls;
    };
    const ok = "start=success checkout=success download=success checksum=success";
    it("reads the report when the scan step failed", async () => {
      const calls = await go({ steps: `${ok} scan=failure`, reportText: JSON.stringify([LEAK]) });
      expect(calls[0].body.body).toContain("`aws-access-token` in `src/a.ts:7`");
      expect(calls[0].body.body).not.toContain("REDACTED");
    });
    it("ignores a report left over when the download step failed", async () => {
      const calls = await go({ steps: "start=success checkout=success download=failure checksum=skipped scan=skipped", reportText: JSON.stringify([LEAK]) });
      expect(calls[0].body.body).toContain("Failed step: download");
      expect(calls[0].body.body).toContain("exit code 3");
      expect(calls[0].body.body).not.toContain("src/a.ts");
    });
    it("uses the no-findings shape for a missing or unreadable report", async () => {
      for (const reportText of [undefined, "", "[]", "{not json"]) {
        const calls = await go({ steps: `${ok} scan=failure`, reportText });
        expect(calls[0].body.body).toContain("step scan failed with exit code 3");
      }
    });
    it("updates its earlier comment instead of adding one", async () => {
      const earlier = [{ id: 21, body: `old\n\n${markerFor("secret-scan")}`, user: { login: AUTHOR } }];
      const calls = await go({ steps: `${ok} scan=failure`, reportText: JSON.stringify([LEAK]), comments: earlier });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("PATCH");
      expect(calls[0].url).toMatch(/comments\/21$/);
    });
  });
  it("never lets a planted value into the comment", async () => {
    const planted = ["s3cr3t", "value"].join("-");
    const t = await run([pr(7, "ticket-66")], { job: "frontend", rep: null, output: `Error: auth ${planted} rejected\n${planted}`, secrets: [planted] });
    await t.run();
    expect(JSON.stringify(t.calls[0].body)).not.toContain(planted);
    expect(t.calls[0].body.body).toContain("Error: auth *** rejected");
  });
  const PLANTED = "0123456789abcdef".repeat(3).slice(0, 40);
  const leaks = (body) => { for (let i = 0; i + 8 <= PLANTED.length; i++) if (body.includes(PLANTED.slice(i, i + 8))) return true; return false; };
  it("masks a secret that crosses the 6000-character tail cut", async () => {
    const t = await run([pr(7, "ticket-66")], { job: "frontend", rep: null, output: "value: " + PLANTED + "y".repeat(5980), secrets: [PLANTED] });
    await t.run();
    expect(leaks(t.calls[0].body.body)).toBe(false);
  });
  it("masks a secret that crosses the 1500-character test-error cut", async () => {
    const r = { suites: [{ title: "a.spec.ts", file: "a.spec.ts", specs: [{ title: "t", tests: [{ status: "unexpected", results: [{ error: { message: "z".repeat(1480) + PLANTED } }] }] }] }] };
    const t = await run([pr(7, "ticket-66")], { rep: r, secrets: [PLANTED] });
    await t.run();
    expect(leaks(t.calls[0].body.body)).toBe(false);
  });
  it("browser falls back when playwright.json is cut off", async () => {
    const t = await run([pr(7, "ticket-66")], { rep: null });
    writeFileSync(t.input.report, '{"suites":[');
    await t.run();
    expect(t.calls[0].body.body).toContain("`make browser` exited with code 3");
  });
  it("log text cannot close the code fence", async () => {
    const t = await run([pr(7, "ticket-66")], { job: "frontend", rep: null, output: "a\n~~~~~~~~\n@everyone" });
    await t.run();
    const body = t.calls[0].body.body;
    expect(body).toContain("~~~~~~~~~\na\n~~~~~~~~\n@everyone\n~~~~~~~~~");
  });
  it("a failed post exits 0 and logs the reason", async () => {
    const t = await run([pr(7, "ticket-66")], { status: 500 });
    const lines = [];
    const spy = vi.spyOn(console, "log").mockImplementation((m) => lines.push(m));
    try {
      await cli({ ...t.env, JOB: "browser", STEPS: t.input.steps, RUN_STEP: "run", CMD: "make browser", OUT_FILE: t.input.outFile });
    } finally { spy.mockRestore(); }
    expect(lines.join("\n")).toMatch(/Could not post the failure: GET .*HTTP 500/);
  });
  it("the script process exits 0 when posting fails", async () => {
    const t = await run([pr(7, "ticket-66")], { status: 500 });
    const env = { ...process.env, ...t.env, JOB: "frontend", STEPS: "run=failure", RUN_STEP: "run", CMD: "make frontend" };
    const stdout = await new Promise((resolve, reject) =>
      execFile(process.execPath, [fileURLToPath(new URL("./post-ci-failure.mjs", import.meta.url))], { env }, (err, so) => (err ? reject(err) : resolve(so))));
    expect(stdout).toMatch(/Could not post the failure: .*HTTP 500/);
  });
});

// The workflows are read as text: the repo has no YAML parser. A job is the block from its key to the next two-space key.
const jobIn = (yml, name) => yml.slice(yml.indexOf(`\n  ${name}:\n`) + 1).split(/\n  (?=[a-z-]+:\n)/)[0];
const stepsIn = (yml, name) => jobIn(yml, name).split(/\n      - /).slice(1);
// What a release.yml browser job sets up, for the release specs and the light specs alike (ci.yml has no browser job).
const BROWSER_SETUP = ['CI: "true"', "LAB_WEBGL: llvmpipe", 'LIBGL_ALWAYS_SOFTWARE: "1"', 'LP_NUM_THREADS: "4"', "xvfb-run -a", 'make browser-light PW_ARGS="--reporter=list,json"', "image: git.tailf69bc5.ts.net/projects/lab-ci:ci-", "password: ${{ secrets.REGISTRY_TOKEN }}"];
const reportSteps = (yml) => yml.split(/\n      - /).filter((b) => b.includes("node scripts/browser-report.mjs"));
// The report: scripts/browser-report.mjs, its own script, so the post-ci-failure assertions don't cover its steps.
function expectReportAfterPost(yml, name, job) {
  const all = stepsIn(yml, name);
  const post = all.findIndex((b) => b.includes("post-ci-failure.mjs"));
  const report = all.findIndex((b) => b.includes("node scripts/browser-report.mjs"));
  expect(post).toBeGreaterThanOrEqual(0);
  expect(report).toBeGreaterThan(post);
  expect(all[report]).toMatch(/continue-on-error: true/);
  expect(all[report]).toMatch(/if: always\(\)/);
  expect(all[report]).toMatch(/MASK_ENV: TOKEN/);
  expect(all[report]).toContain(`JOB: ${job}`);
  expect(all[report]).toContain("OUTCOME: ${{ steps.run.outcome }}");
  expect(all[report]).toContain("START_FILE: ${{ runner.temp }}/start");
  expect(all[report]).toContain("REPORT: ${{ runner.temp }}/playwright.json");
  expect(all[report].match(/TOKEN: (.*)/g)?.every((l) => l.endsWith("${{ secrets.GITHUB_TOKEN }}"))).toBe(true);
}

describe("ci.yml", () => {
  const yml = readFileSync(new URL("../.forgejo/workflows/ci.yml", import.meta.url), "utf8");
  it("every post step has continue-on-error: true", () => {
    const posts = yml.split(/\n      - /).filter((b) => b.includes("post-ci-failure.mjs"));
    expect(posts).toHaveLength(6);
    for (const p of posts) expect(p).toMatch(/continue-on-error: true/);
  });
  it("has no browser job and runs no browser specs: the release runs them (#352)", () => {
    expect(yml).not.toMatch(/^  browser:/m);
    expect(yml).not.toMatch(/make browser/);
    expect(yml).not.toContain("browser-report.mjs");
    expect(yml).not.toContain("JOB: browser\n");
  });
});

describe("release.yml", () => {
  const yml = readFileSync(new URL("../.forgejo/workflows/release.yml", import.meta.url), "utf8");
  const job = (name) => jobIn(yml, name);
  const steps = (name) => stepsIn(yml, name);
  it("moves staging only after the image and the release specs pass", () => {
    expect(job("staging")).toMatch(/^    needs: \[image, browser\]$/m);
  });
  it("the browser job runs the release specs only, and there are no screenshots: every PR takes them", () => {
    expect(job("browser")).toContain('make browser-release PW_ARGS="--reporter=list,json"');
    expect(job("browser")).not.toContain("make browser-light");
    expect(yml).not.toMatch(/^  screenshots:/m);
    expect(yml).not.toContain("playwright.screenshots.config.ts");
  });
  it("the browser-light job waits for staging, and skips when staging didn't move", () => {
    const light = job("browser-light");
    expect(light).toMatch(/^    needs: staging$/m);
    expect(light).toMatch(/^    if: needs\.staging\.outputs\.moved == 'true'$/m);
  });
  it("staging doesn't wait for browser-light", () => {
    expect(job("staging")).not.toMatch(/needs:.*browser-light/);
    expect(yml.match(/needs:.*browser-light/g)).toBeNull();
  });
  it("the browser-light job runs the light specs with the same setup as the release specs", () => {
    const light = job("browser-light");
    expect(light).not.toContain("browser-release");
    for (const part of BROWSER_SETUP) expect(light, part).toContain(part);
    // The same CI image (ci/Dockerfile), so the two sets of specs draw with the same Chromium and Mesa.
    const image = (name) => job(name).match(/^      image: (.+)$/m)?.[1];
    expect(image("browser")).toMatch(/lab-ci:ci-/);
    expect(image("browser-light")).toBe(image("browser"));
  });
  it("every post step has continue-on-error: true and masks the token", () => {
    const posts = yml.split(/\n      - /).filter((b) => b.includes("post-ci-failure.mjs"));
    expect(posts).toHaveLength(2);
    for (const p of posts) {
      expect(p).toMatch(/continue-on-error: true/);
      expect(p).toMatch(/MASK_ENV: TOKEN/);
    }
    expect(steps("browser").find((b) => b.includes("post-ci-failure.mjs"))).toContain("JOB: browser\n");
    expect(steps("browser-light").find((b) => b.includes("post-ci-failure.mjs"))).toContain("JOB: browser-light\n");
  });
  it("each browser job reports the run after the failure post, whatever the result, without failing", () => {
    expectReportAfterPost(yml, "browser", "browser");
    expectReportAfterPost(yml, "browser-light", "browser-light");
  });
  it("every report step is continue-on-error", () => {
    expect(reportSteps(yml)).toHaveLength(2);
    for (const r of reportSteps(yml)) expect(r).toMatch(/continue-on-error: true/);
  });
  it("only the browser jobs run the report", () => {
    expect(job("image")).not.toContain("browser-report.mjs");
    expect(job("staging")).not.toContain("browser-report.mjs");
  });
  // The release clock: scripts/release-clock.mjs holds the rule, these check the wiring.
  it("the browser job exposes start, retried and the load average as outputs", () => {
    const outputs = job("browser").split("\n    env:")[0];
    expect(outputs).toMatch(/^      start: \$\{\{ steps\.start\.outputs\.start \}\}$/m);
    expect(outputs).toMatch(/^      retried: \$\{\{ steps\.facts\.outputs\.retried \}\}$/m);
    expect(outputs).toMatch(/^      load: \$\{\{ steps\.facts\.outputs\.load \}\}$/m);
    const start = steps("browser").find((b) => b.includes("id: start"));
    expect(start).toContain('/start"'); // still writes the start file the failure post reads
    expect(start).toContain('echo "start=');
  });
  it("the browser job reads retried from the Playwright report, whatever the test result, without failing", () => {
    const facts = steps("browser").find((b) => b.includes("id: facts"));
    expect(facts).toContain("node scripts/release-clock.mjs retried");
    expect(facts).toContain("REPORT: ${{ runner.temp }}/playwright.json");
    expect(facts).toMatch(/if: always\(\)/);
    expect(facts).toMatch(/continue-on-error: true/);
  });
  it("the image job exposes its start time, for when the runs API can't be read", () => {
    expect(job("image")).toMatch(/^      start: \$\{\{ steps\.start\.outputs\.start \}\}$/m);
  });
  it("the staging job exposes moved: false on the 'main has moved past' exit, true after the push", () => {
    const staging = job("staging");
    expect(staging).toMatch(/^      moved: \$\{\{ steps\.move\.outputs\.moved \}\}$/m);
    const move = steps("staging").find((b) => b.includes("id: move"));
    const pastExit = move.slice(move.indexOf("main has moved past"));
    expect(pastExit.split("exit 0")[0]).toContain('echo "moved=false" >> "$GITHUB_OUTPUT"');
    const afterPush = move.slice(move.indexOf("git push"));
    expect(afterPush.split("exit 0")[0]).toContain('echo "moved=true" >> "$GITHUB_OUTPUT"');
  });
  it("the warning step runs after the push, and continues on error", () => {
    const all = steps("staging");
    const move = all.findIndex((b) => b.includes("id: move"));
    const clock = all.findIndex((b) => b.includes("release-clock.mjs warn"));
    expect(move).toBeGreaterThanOrEqual(0);
    expect(clock).toBeGreaterThan(move);
    expect(all[clock]).toMatch(/continue-on-error: true/);
    expect(all[clock]).toContain("RUN_ID: ${{ github.run_id }}");
    expect(all[clock]).not.toContain("run_number: "); // the API id, not the run number, finds the run
    expect(all[clock].match(/TOKEN: (.*)/g)?.every((l) => l.endsWith("${{ secrets.GITHUB_TOKEN }}"))).toBe(true);
  });
  // The staging-skipped warning: scripts/staging-skipped.mjs holds the rule, these check the wiring (a release can't run on a PR).
  it("the move step passes out seen and runs on the 'main has moved past' exit, before it exits", () => {
    const move = steps("staging").find((b) => b.includes("id: move"));
    const pastExit = move.slice(move.indexOf("main has moved past")).split("exit 0")[0];
    expect(pastExit).toContain('echo "seen=$seen" >> "$GITHUB_OUTPUT"');
    expect(pastExit).toMatch(/echo "runs=.*>> "\$GITHUB_OUTPUT"/);
  });
  it("the staging-skipped step runs after the move, only when staging didn't move, and continues on error", () => {
    const all = steps("staging");
    const move = all.findIndex((b) => b.includes("id: move"));
    const skipped = all.findIndex((b) => b.includes("node scripts/staging-skipped.mjs"));
    expect(move).toBeGreaterThanOrEqual(0);
    expect(skipped).toBeGreaterThan(move);
    expect(all[skipped]).toMatch(/^ {8}if: steps\.move\.outputs\.moved == 'false'$/m);
    expect(all[skipped]).toMatch(/^ {8}continue-on-error: true$/m);
  });
  it("the staging-skipped step reads moved, seen and runs from the move step, and the token from GITHUB_TOKEN", () => {
    const step = steps("staging").find((b) => b.includes("node scripts/staging-skipped.mjs"));
    expect(step).toMatch(/^ {10}MOVED: \$\{\{ steps\.move\.outputs\.moved \}\}$/m);
    expect(step).toMatch(/^ {10}SEEN: \$\{\{ steps\.move\.outputs\.seen \}\}$/m);
    expect(step).toMatch(/^ {10}RUNS: \$\{\{ steps\.move\.outputs\.runs \}\}$/m);
    expect(step.match(/TOKEN: (.*)/g)?.every((l) => l.endsWith("${{ secrets.GITHUB_TOKEN }}"))).toBe(true);
    expect(step.match(/TOKEN: /g)).toHaveLength(1);
  });
  it("runs only when started by hand, never on a push", () => {
    const on = yml.slice(yml.indexOf("\non:\n"), yml.indexOf("\njobs:"));
    expect(on).toMatch(/^  workflow_dispatch:/m);
    expect(on).not.toMatch(/^  push:/m);
    expect(on.match(/^  \S/gm)).toHaveLength(1);
  });
});

describe("ci.yml screenshots job", () => {
  const yml = readFileSync(new URL("../.forgejo/workflows/ci.yml", import.meta.url), "utf8");
  const job = yml.slice(yml.indexOf("  screenshots:"), yml.indexOf("  secret-scan:"));
  it("masks the token in its failure report and takes it from GITHUB_TOKEN only", () => {
    expect(job).toMatch(/MASK_ENV: TOKEN/);
    expect(job.match(/TOKEN: (.*)/g)?.every((l) => l.endsWith("${{ secrets.GITHUB_TOKEN }}"))).toBe(true);
  });
  it("skips the browser steps when there is no open PR", () => {
    for (const id of ["drivers", "run", "post"]) {
      const step = job.slice(job.indexOf(`id: ${id}`)).split("\n      - ")[0];
      expect(step, id).toContain("if: steps.pr.outputs.pr != ''");
    }
  });
});
