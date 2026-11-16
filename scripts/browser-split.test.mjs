// The split between the light browser specs (every PR, and main after staging) and the release specs (before staging).
// It reads both selections from the Makefile itself (`make -n`, which prints the command without running it), lists each
// with Playwright's list mode, which starts no browser and no web server (about 1 s a run), and checks the two sets don't
// overlap and together are the whole suite. A test in neither would run nowhere; a test in both would run twice.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** The Playwright command a make target would run, with `--list --reporter=json` added. */
function listCommand(target) {
  const lines = run("make", ["-n", target, "PW_ARGS=--list --reporter=json"]).split("\n");
  const cmd = lines.filter((l) => l.startsWith("npx playwright test"));
  if (cmd.length !== 1) throw new Error(`make -n ${target} should print one "npx playwright test" line:\n${lines.join("\n")}`);
  return cmd[0];
}

/** Every test in a Playwright JSON list, as "project > file:line > titles". Each test in a project once. */
function tests(json) {
  const out = [];
  const walk = (suite, titles) => {
    const path = suite.title && suite.title !== suite.file ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) out.push({ key: `${t.projectName} > ${spec.file}:${spec.line} > ${[...path, spec.title].join(" > ")}`, project: t.projectName, title: [...path, spec.title, ...(spec.tags ?? []).map((g) => `@${g.replace(/^@/, "")}`)].join(" ") });
    }
    for (const s of suite.suites ?? []) walk(s, path);
  };
  for (const s of json.suites ?? []) walk(s, []);
  return out;
}

// Playwright exits 1 when a selection matches nothing. That is an empty list here, so the assertions say what is missing.
function list(command) {
  try {
    return tests(JSON.parse(run("sh", ["-c", command])));
  } catch (e) {
    if (e.stdout) return tests(JSON.parse(e.stdout));
    throw e;
  }
}

describe("the browser split", () => {
  let all, light, release, timing;
  beforeAll(() => {
    all = list("npx playwright test --list --reporter=json");
    light = list(listCommand("browser-light"));
    release = list(listCommand("browser-release"));
    timing = list("npx playwright test --list --reporter=json --project timing");
  }, 60_000);

  it("has a suite to split", () => {
    expect(all.length).toBeGreaterThan(0);
    expect(light.length).toBeGreaterThan(0);
    expect(release.length).toBeGreaterThan(0);
  });

  it("runs no test in both the light and the release selection", () => {
    const inRelease = new Set(release.map((t) => t.key));
    expect(light.filter((t) => inRelease.has(t.key)).map((t) => t.key)).toEqual([]);
  });

  it("runs every test of the suite in one of the two", () => {
    const selected = new Set([...light, ...release].map((t) => t.key));
    expect(all.filter((t) => !selected.has(t.key)).map((t) => t.key)).toEqual([]);
    expect(selected.size).toBe(all.length);
  });

  it("makes the release selection exactly the @timing and @render tests", () => {
    const tagged = all.filter((t) => /@timing|@render/.test(t.title)).map((t) => t.key).sort();
    expect(release.map((t) => t.key).sort()).toEqual(tagged);
  });

  // A typo in a project's pattern would put a limit check in the retrying project, where a failure passes on its second try.
  it("puts exactly the @timing tests in the timing project, and none in the other", () => {
    const tagged = all.filter((t) => /@timing/.test(t.title));
    expect(tagged.length).toBeGreaterThan(0);
    expect(tagged.map((t) => t.project)).toEqual(tagged.map(() => "timing"));
    expect(timing.map((t) => t.key).sort()).toEqual(tagged.map((t) => t.key).sort());
  });
});
