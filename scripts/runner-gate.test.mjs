import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { POLL_SECONDS, WAIT_LIMIT_SECONDS, cli, decide, gate } from "./runner-gate.mjs";

// A task as Forgejo's GET /repos/{owner}/{repo}/actions/tasks returns it: one per job a runner has picked up.
// `at` is seconds after a fixed base, so the tests can say "same second" or "one second earlier".
const BASE = Date.parse("2026-11-17T12:00:00Z");
const iso = (at) => new Date(BASE + at * 1000).toISOString().replace(".000Z", "Z");
let nextId = 1000;
const task = (workflow, run, name, at, status = "running", id = nextId++) => ({
  id, name, workflow_id: workflow, run_number: run, status, run_started_at: iso(at), created_at: iso(at), updated_at: iso(at),
});
const ci = (run, name, at, status, id) => task("ci.yml", run, name, at, status, id);
const rel = (run, name, at, status, id) => task("release.yml", run, name, at, status, id);

// The job asking: it is one of the tasks, and says which with its workflow, run number and job name.
const me = (t) => ({ workflow: t.workflow_id, runNumber: t.run_number, job: t.name });
const ask = (self, ...others) => decide({ tasks: [self, ...others], run: me(self) });

describe("decide: a release job", () => {
  it("waits for a CI job that started earlier", () => {
    const earlier = ci(700, "frontend", -30);
    const r = ask(rel(701, "browser", 0), earlier);
    expect(r.wait).toBe(true);
    expect(r.blockers).toEqual([earlier]);
  });
  it("ignores a CI job that started later", () => {
    expect(ask(rel(701, "browser", 0), ci(702, "frontend", 5)).wait).toBe(false);
  });
  it("goes when nothing else is running", () => {
    expect(ask(rel(701, "browser", 0)).wait).toBe(false);
  });
  it("goes when the earlier job has finished, whatever way it ended", () => {
    for (const status of ["success", "failure", "cancelled", "skipped"]) expect(ask(rel(701, "browser", 0), ci(700, "frontend", -30, status)).wait).toBe(false);
  });
  it("does not wait for its own run's other jobs, even ones that started earlier", () => {
    expect(ask(rel(701, "browser", 0), rel(701, "image", -20), rel(701, "staging", -5)).wait).toBe(false);
  });
  it("still waits for a CI job while its own run's other jobs run too", () => {
    const earlier = ci(700, "frontend", -30);
    expect(ask(rel(701, "browser", 0), rel(701, "image", -20), earlier).blockers).toEqual([earlier]);
  });
  it("waits for an earlier job of another release run", () => {
    const other = rel(699, "browser", -60);
    expect(ask(rel(701, "browser", 0), other).blockers).toEqual([other]);
  });
  it("waits for an earlier job of any other workflow (a promote)", () => {
    const promote = task("promote.yml", 698, "production", -10);
    expect(ask(rel(701, "browser", 0), promote).blockers).toEqual([promote]);
  });
  it("a run number alone doesn't make a job part of the run: the workflow counts too", () => {
    // Run numbers are per repo in Forgejo, but the same number in another workflow must not be taken for this run.
    const other = ci(701, "frontend", -30);
    expect(ask(rel(701, "browser", 0), other).wait).toBe(true);
  });
});

describe("decide: a CI job", () => {
  it("waits for a running release job that started earlier", () => {
    const release = rel(701, "browser", -30);
    const r = ask(ci(702, "frontend", 0), release);
    expect(r.wait).toBe(true);
    expect(r.blockers).toEqual([release]);
  });
  it("does not wait for another CI job, earlier or later", () => {
    expect(ask(ci(702, "frontend", 0), ci(700, "backend", -30), ci(703, "backend", 4)).wait).toBe(false);
  });
  it("does not wait for its own run's other jobs", () => {
    expect(ask(ci(702, "frontend", 0), ci(702, "backend", -5), ci(702, "facts", 2)).wait).toBe(false);
  });
  it("goes when the release job has finished", () => {
    expect(ask(ci(702, "frontend", 0), rel(701, "browser", -30, "success")).wait).toBe(false);
  });
  it("goes ahead of a release job that started after it: that release job waits for this one", () => {
    expect(ask(ci(702, "frontend", 0), rel(703, "browser", 3)).wait).toBe(false);
  });
  it("does not wait for a promote job", () => {
    expect(ask(ci(702, "frontend", 0), task("promote.yml", 698, "production", -10)).wait).toBe(false);
  });
});

describe("decide: the same second", () => {
  it("a release job goes and a CI job waits for it", () => {
    const c = ci(702, "frontend", 0);
    const r = rel(701, "browser", 0);
    expect(ask(r, c).wait).toBe(false);
    expect(ask(c, r).blockers).toEqual([r]);
  });
  it("two release jobs from different runs: only the one with the lower task id waits for the other", () => {
    const first = rel(701, "browser", 0, "running", 1);
    const second = rel(702, "browser", 0, "running", 2);
    expect(ask(first, second).wait).toBe(false);
    expect(ask(second, first).blockers).toEqual([first]);
  });
});

describe("decide: no deadlock", () => {
  // Two jobs that are each other's blocker would wait forever. Try every pair of kinds at every start offset, in both
  // directions and with both id orders: at most one of the two may wait for the other.
  const kinds = [
    ["release", (run, name, at, id) => rel(run, name, at, "running", id)],
    ["ci", (run, name, at, id) => ci(run, name, at, "running", id)],
  ];
  const cases = [];
  for (const [ka, a] of kinds)
    for (const [kb, b] of kinds)
      for (const offset of [-5, -1, 0, 1, 5])
        for (const [ida, idb] of [[1, 2], [2, 1]]) cases.push({ ka, kb, offset, ida, idb, a, b });
  it.each(cases)("$ka job against a $kb job $offset s later, ids $ida and $idb", ({ offset, ida, idb, a, b }) => {
    const x = a(800, "x", 0, ida);
    const y = b(801, "y", offset, idb);
    const xWaits = ask(x, y).blockers.includes(y);
    const yWaits = ask(y, x).blockers.includes(x);
    expect(xWaits && yWaits).toBe(false);
  });
  it("of any set of running jobs, the first to start never waits, so the set always drains", () => {
    const jobs = [rel(1, "image", 3, "running", 11), rel(1, "browser", 3, "running", 12), ci(2, "frontend", 0, "running", 13), ci(2, "facts", 3, "running", 14), rel(3, "browser", 3, "running", 10)];
    const nobodyBlocks = jobs.filter((j) => !decide({ tasks: jobs, run: me(j) }).wait);
    expect(nobodyBlocks.length).toBeGreaterThan(0);
  });
});

describe("decide: a job that isn't in the list", () => {
  it("throws, saying which job it looked for", () => {
    expect(() => decide({ tasks: [ci(700, "backend", 0)], run: { workflow: "release.yml", runNumber: 9, job: "browser" } })).toThrow(/release\.yml.*#9.*browser/);
  });
  it("does not take a finished task for itself", () => {
    expect(() => decide({ tasks: [rel(9, "browser", 0, "success")], run: { workflow: "release.yml", runNumber: 9, job: "browser" } })).toThrow(/not in the list/);
  });
});

describe("gate", () => {
  // A fake clock: sleeping moves it on, and the tasks come from a function of the time.
  function world(tasksAt) {
    const state = { now: 0, lines: [], reads: 0 };
    return {
      state,
      opts: {
        fetchTasks: async () => { state.reads++; return tasksAt(state.now); },
        now: () => state.now,
        sleep: async (s) => { state.now += s; },
        log: (m) => state.lines.push(m),
      },
    };
  }
  const mine = rel(701, "browser", 0);

  it("goes at once, with a log line saying it didn't wait", async () => {
    const w = world(() => [mine]);
    await gate({ ...w.opts, run: me(mine) });
    expect(w.state.now).toBe(0);
    expect(w.state.lines).toHaveLength(1);
    expect(w.state.lines[0]).toMatch(/release job.*did not wait/);
  });
  it("polls every 10 s until the earlier job ends, and logs one line with what it waited for and for how long", async () => {
    expect(POLL_SECONDS).toBe(10);
    const earlier = ci(700, "frontend", -30);
    const w = world((now) => [mine, now < 95 ? earlier : { ...earlier, status: "success" }]);
    await gate({ ...w.opts, run: me(mine) });
    expect(w.state.now).toBe(100);
    expect(w.state.reads).toBe(11);
    const done = w.state.lines.filter((l) => /waited/.test(l));
    expect(done).toHaveLength(1);
    expect(done[0]).toContain("waited 100 s");
    expect(done[0]).toContain("ci.yml #700 frontend");
  });
  it("gives up after 60 minutes and fails, saying what it was waiting for", async () => {
    expect(WAIT_LIMIT_SECONDS).toBe(3600);
    const stuck = ci(700, "frontend", -30);
    const w = world(() => [mine, stuck]);
    await expect(gate({ ...w.opts, run: me(mine) })).rejects.toThrow(/gave up after 3600 s.*ci\.yml #700 frontend/);
    expect(w.state.now).toBe(3600);
  });
  it("a CI job waits for a release job the same way", async () => {
    const c = ci(702, "frontend", 0);
    const release = rel(701, "browser", -10);
    const w = world((now) => [c, now < 30 ? release : { ...release, status: "failure" }]);
    await gate({ ...w.opts, run: me(c) });
    expect(w.state.lines.find((l) => /waited/.test(l))).toMatch(/CI job waited 30 s for release\.yml #701 browser/);
  });
  it("retries a read that fails, and fails the job after 3 failed reads in a row, naming the error", async () => {
    let n = 0;
    const w = world(() => { n++; throw new Error("HTTP 403"); });
    await expect(gate({ ...w.opts, run: me(mine) })).rejects.toThrow(/could not read the task list.*HTTP 403/);
    expect(n).toBe(3);
  });
  it("one failed read among good ones is forgiven", async () => {
    let n = 0;
    const earlier = ci(700, "frontend", -30);
    const w = world(() => {
      n++;
      if (n === 1) throw new Error("HTTP 502");
      return [mine, n < 4 ? earlier : { ...earlier, status: "success" }];
    });
    await gate({ ...w.opts, run: me(mine) });
    expect(w.state.lines.some((l) => /waited/.test(l))).toBe(true);
  });
});

describe("the command, against a fake Forgejo", () => {
  let server;
  afterEach(() => server?.close());
  async function run(mode, env, tasks, status = 200) {
    const urls = [];
    const auth = [];
    server = createServer((req, res) => {
      urls.push(req.url);
      auth.push(req.headers.authorization);
      res.statusCode = status;
      res.end(JSON.stringify({ workflow_runs: tasks, total_count: tasks.length }));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const e = { PATH: process.env.PATH, SERVER_URL: `http://127.0.0.1:${server.address().port}`, REPOSITORY: "projects/lab", TOKEN: "tok", ...env };
    const script = fileURLToPath(new URL("./runner-gate.mjs", import.meta.url));
    const result = await new Promise((resolve) => execFile(process.execPath, [script, mode], { env: e }, (err, stdout, stderr) => resolve({ code: err?.code ?? 0, stdout, stderr })));
    return { ...result, urls, auth };
  }
  it("reads the running tasks with the job's token and logs that it did not wait", async () => {
    const mineCi = ci(702, "frontend", 0);
    const r = await run("ci", { RUN_NUMBER: "702", JOB: "frontend" }, [mineCi]);
    expect(r.code).toBe(0);
    expect(r.urls[0]).toBe("/api/v1/repos/projects/lab/actions/tasks?status=running&limit=50&page=1");
    expect(r.auth[0]).toBe("token tok");
    expect(r.stdout).toMatch(/CI job.*did not wait/);
  });
  it("a release job exits 0 when only its own run's jobs and later jobs are running", async () => {
    const r = await run("release", { RUN_NUMBER: "701", JOB: "browser" }, [rel(701, "browser", 0), rel(701, "image", -5), ci(703, "backend", 4)]);
    expect(r.code).toBe(0);
  });
  it("fails the job when the token can't read the task list, saying so, after 3 reads, and never prints the token", async () => {
    const urls = [];
    server = createServer((req, res) => { urls.push(req.url); res.statusCode = 403; res.end("{}"); });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const e = { SERVER_URL: `http://127.0.0.1:${server.address().port}`, REPOSITORY: "projects/lab", TOKEN: "tok", RUN_NUMBER: "702", JOB: "frontend" };
    const lines = [];
    const spy = vi.spyOn(console, "log").mockImplementation((m) => lines.push(m));
    let error;
    try { await cli("ci", e, { sleep: async () => {} }); } catch (err) { error = err; } finally { spy.mockRestore(); }
    expect(error.message).toMatch(/could not read the task list.*HTTP 403/);
    expect(urls).toHaveLength(3);
  });
  it("fails on an unknown mode", async () => {
    const r = await run("both", { RUN_NUMBER: "1", JOB: "x" }, []);
    expect(r.code).toBe(1);
  });
});

// The workflows are read as text: the repo has no YAML parser. A job is the block from its key to the next two-space key.
const jobIn = (yml, name) => yml.slice(yml.indexOf(`\n  ${name}:\n`) + 1).split(/\n  (?=[a-z-]+:\n)/)[0];
const jobNames = (yml) => [...yml.slice(yml.indexOf("\njobs:\n")).matchAll(/^  ([a-z-]+):\n/gm)].map((m) => m[1]);
const stepsIn = (yml, name) => jobIn(yml, name).split(/\n      - /).slice(1);
// The release's image and ci-image jobs run in the kaniko debug container: no node, no checkout, so no scripts. The gate job runs the gate for them, and they need that job.
// ci.yml's ci-image is the same build-ci-image call, so ci.yml has a gate job for it too.
const UNGATED = ["release.yml image", "release.yml ci-image", "ci.yml ci-image"];
const GATED = { "ci.yml": "ci", "release.yml": "release" };

describe.each(Object.entries(GATED))("%s has the gate in every job", (file, mode) => {
  const yml = readFileSync(new URL(`../.forgejo/workflows/${file}`, import.meta.url), "utf8");
  const jobs = jobNames(yml).filter((j) => !UNGATED.includes(`${file} ${j}`));
  it("finds the jobs", () => {
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobNames(yml)).toContain(file === "ci.yml" ? "secret-scan" : "browser-light");
  });
  it.each(jobs)("%s: the gate step runs the script in the workflow's mode, with the job's token, run number and job name", (name) => {
    const gateSteps = stepsIn(yml, name).filter((s) => s.includes("node scripts/runner-gate.mjs"));
    expect(gateSteps).toHaveLength(1);
    expect(gateSteps[0]).toContain(`node scripts/runner-gate.mjs ${mode}`);
    expect(gateSteps[0]).toContain("TOKEN: ${{ secrets.GITHUB_TOKEN }}");
    expect(gateSteps[0]).toContain("RUN_NUMBER: ${{ github.run_number }}");
    expect(gateSteps[0]).toContain(`JOB: ${name}`);
    expect(gateSteps[0]).not.toMatch(/continue-on-error/);
  });
});

describe("ci.yml's gate job", () => {
  const yml = readFileSync(new URL("../.forgejo/workflows/ci.yml", import.meta.url), "utf8");
  it("comes before ci-image, which needs it, and screenshots needs ci-image (the CI image it runs in)", () => {
    expect(jobNames(yml).indexOf("gate")).toBeLessThan(jobNames(yml).indexOf("ci-image"));
    expect(jobIn(yml, "ci-image")).toMatch(/^    needs: gate$/m);
    expect(jobIn(yml, "screenshots")).toMatch(/^    needs: ci-image$/m);
  });
  it("ci-image has no gate step of its own: its build job's container has no node", () => {
    expect(jobIn(yml, "ci-image")).not.toContain("runner-gate");
  });
});

describe("release.yml's gate job", () => {
  const yml = readFileSync(new URL("../.forgejo/workflows/release.yml", import.meta.url), "utf8");
  it("is the first job: image and ci-image need it, and browser needs ci-image (the CI image it runs in)", () => {
    expect(jobNames(yml)[0]).toBe("gate");
    expect(jobIn(yml, "image")).toMatch(/^    needs: gate$/m);
    expect(jobIn(yml, "ci-image")).toMatch(/^    needs: gate$/m);
    expect(jobIn(yml, "browser")).toMatch(/^    needs: ci-image$/m);
  });
  it("staging still needs image and browser only, and nothing else in the job graph is new", () => {
    expect(jobIn(yml, "staging")).toMatch(/^    needs: \[image, browser\]$/m);
    expect(jobNames(yml)).toEqual(["gate", "image", "ci-image", "browser", "staging", "browser-light"]);
  });
  it("image and ci-image have no gate step of their own: their container has no node", () => {
    expect(jobIn(yml, "image")).not.toContain("runner-gate");
    expect(jobIn(yml, "ci-image")).not.toContain("runner-gate");
  });
});
