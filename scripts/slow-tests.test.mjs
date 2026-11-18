import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SLOW_MS, slowTestLines } from "./slow-tests.mjs";

// The shape of vitest's JSON reporter output (`--reporter=json`): per file, per test, a duration in ms.
const ROOT = "/work/lab";
const report = (...tests) => ({
  testResults: [{ name: `${ROOT}/src/pin.test.ts`, assertionResults: tests }],
});
const test = (fullName, duration, status = "passed") => ({ fullName, title: fullName, duration, status });

describe("slowTestLines", () => {
  it("warns once for a test over the threshold and not for a faster one", () => {
    const lines = slowTestLines(report(test("pin sweep", 1500), test("pin snap", 20)), { root: ROOT });
    expect(lines).toEqual(["::warning::src/pin.test.ts: pin sweep took 1500 ms (over 1000 ms)"]);
  });

  it("uses the 1000 ms threshold: exactly 1000 ms is not over it", () => {
    expect(SLOW_MS).toBe(1000);
    expect(slowTestLines(report(test("edge", 1000), test("just over", 1001)), { root: ROOT })).toHaveLength(1);
  });

  it("rounds the duration and lists the slowest first", () => {
    const lines = slowTestLines(report(test("a", 1200.4), test("b", 3000.6)), { root: ROOT });
    expect(lines.map((l) => l.match(/\w+ took (\d+) ms/).slice(1))).toEqual([["3001"], ["1200"]]);
  });

  it("looks across files, and skips tests with no duration (skipped, todo)", () => {
    const r = {
      testResults: [
        { name: `${ROOT}/src/a.test.ts`, assertionResults: [test("slow a", 2000)] },
        { name: `${ROOT}/scripts/b.test.mjs`, assertionResults: [test("slow b", 1100), test("skipped", null, "pending")] },
      ],
    };
    const lines = slowTestLines(r, { root: ROOT });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("src/a.test.ts");
    expect(lines[1]).toContain("scripts/b.test.mjs");
  });

  it("escapes a test name's line breaks and percent signs so the annotation stays one line", () => {
    const [line] = slowTestLines(report(test("100%\nsweep", 5000)), { root: ROOT });
    expect(line).not.toContain("\n");
    expect(line).toContain("100%25%0Asweep");
  });

  it("with a threshold of 0 every test that has a duration warns (the break check)", () => {
    const lines = slowTestLines(report(test("a", 0.4), test("b", 20), test("c", 1500)), { root: ROOT, thresholdMs: 0 });
    expect(lines).toHaveLength(3);
  });
});

describe("node scripts/slow-tests.mjs", () => {
  let dir;
  beforeEach(() => (dir = realpathSync(mkdtempSync(join(tmpdir(), "slow-tests-")))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const script = fileURLToPath(new URL("./slow-tests.mjs", import.meta.url));
  const run = (file) =>
    new Promise((resolve) => {
      execFile("node", [script, file], { cwd: dir }, (err, stdout, stderr) =>
        resolve({ code: err ? err.code : 0, stdout, stderr }),
      );
    });

  it("prints one ::warning:: line for the slow test of a fixture report and nothing for the fast one, and exits 0", async () => {
    const file = join(dir, "report.json");
    writeFileSync(file, JSON.stringify({ testResults: [{ name: join(dir, "src/pin.test.ts"), assertionResults: [test("slow one", 2500), test("fast one", 5)] }] }));
    const { code, stdout } = await run(file);
    expect(code).toBe(0);
    expect(stdout.trim().split("\n")).toEqual(["::warning::src/pin.test.ts: slow one took 2500 ms (over 1000 ms)"]);
    expect(stdout).not.toContain("fast one");
  });

  it("prints no warning when every test is fast", async () => {
    const file = join(dir, "report.json");
    writeFileSync(file, JSON.stringify(report(test("fast", 5))));
    const { code, stdout } = await run(file);
    expect(code).toBe(0);
    expect(stdout).not.toContain("::warning::");
  });

  it("exits 0 with a note, not a warning, when the report is missing or unreadable: it never fails the job", async () => {
    const missing = await run(join(dir, "nope.json"));
    expect(missing.code).toBe(0);
    expect(missing.stdout).not.toContain("::warning::");
    expect(missing.stdout).toContain("slow tests: could not read");
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{not json");
    const unreadable = await run(bad);
    expect(unreadable.code).toBe(0);
    expect(unreadable.stdout).toContain("slow tests: could not read");
  });
});

describe("ci.yml and the Makefile", () => {
  const yml = readFileSync(new URL("../.forgejo/workflows/ci.yml", import.meta.url), "utf8");
  const make = readFileSync(new URL("../Makefile", import.meta.url), "utf8");
  const frontend = yml.split(/^  frontend:$/m)[1].split(/^  \w[\w-]*:$/m)[0];
  const steps = frontend.split(/\n      - /);
  const slow = steps.find((s) => s.includes("slow-tests.mjs"));
  it("make frontend writes the JSON report the script reads, next to the normal output", () => {
    const recipe = make.split(/^frontend:\n/m)[1].split(/^\S/m)[0];
    expect(recipe).toContain("--reporter=default --reporter=json --outputFile.json=test-results/vitest.json");
    expect(frontend).toContain("node scripts/slow-tests.mjs test-results/vitest.json");
  });
  it("the frontend job runs it after make frontend, whatever that did, and it can't fail the job", () => {
    expect(slow).toBeDefined();
    expect(steps.indexOf(slow)).toBeGreaterThan(steps.findIndex((s) => s.includes("make frontend 2>&1")));
    expect(slow).toMatch(/if: always\(\)/);
    expect(slow).toMatch(/continue-on-error: true/);
  });
});
