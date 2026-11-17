// The browser job's report: what a browser run cost. A step after the job's tests, pass or fail.
// It is its own script, not post-ci-failure.mjs: that one reports a failure, this one reports every run.
// Only release.yml's browser jobs run it now (no browser job in ci.yml since #352), so the PR path below is unused by the workflows.
// It reads the Playwright JSON report, the job's start file and loadavg(), and never changes the job result.
//   On a PR:   creates or updates one marked comment. A pass shows the job's time, the load average, the flaky tests with
//              their first error, the 10 slowest tests and the median and total boot time (the `boot-ms` annotation
//              openTour in tests/lib/page.ts writes). A failure says the run failed and links the failure comment.
//   On main:   a pass with at least one flaky test is a comment on "CI failures on main". A clean pass writes nothing.
//              A failure writes nothing: its failure comment (post-ci-failure.mjs) carries the flaky tests.
import { existsSync, readFileSync } from "node:fs";
import { loadavg } from "node:os";
import { fileURLToPath } from "node:url";
import { api, eachTest, findComment, findOrCreateIssue, findPr, flakyLines, flakyTests, formatDuration, mask, markerFor } from "./post-ci-failure.mjs";

const SLOWEST = 10;

/** Hidden line that marks a job's report comment as ours, so a later push updates it. Not the failure comment's marker. */
export const reportMarkerFor = (job) => `<!-- ci-${job}-report -->`;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** The `boot-ms` annotation values of a test's last attempt, falling back to the test's own list, as numbers. */
function bootValues(t) {
  const last = t.results?.[t.results.length - 1];
  const annotations = last?.annotations?.length ? last.annotations : (t.annotations ?? []);
  return annotations.filter((a) => a.type === "boot-ms").map((a) => Number(a.description)).filter(Number.isFinite);
}

/**
 * The slowest tests and the boot times of a Playwright JSON report. A test's time is all its attempts added up.
 * `boot` covers annotated tests only: its `tests` is how many, its `all` how many ran, and a test that called openTour
 * more than once counts the sum of its boots.
 */
export function measure(report) {
  const timed = [];
  const boots = [];
  let all = 0;
  eachTest(report, (t, name, file) => {
    if (t.status === "skipped") return;
    all++;
    timed.push({ name: file && !name.startsWith(file) ? `${file} > ${name}` : name, ms: sum((t.results ?? []).map((r) => r.duration ?? 0)) });
    const values = bootValues(t);
    if (values.length) boots.push(sum(values));
  });
  const sorted = [...boots].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = !sorted.length ? undefined : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { slowest: timed.sort((a, b) => b.ms - a.ms).slice(0, SLOWEST), boot: { tests: boots.length, all, median, total: sum(boots) } };
}

const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
const inline = (s) => s.replace(/[*`|\r\n]+/g, "'");

/**
 * The PR comment of a passed run. `i`: job, sha, seconds, load, flaky ({ name, error }[]), and measure()'s slowest and boot,
 * or no `slowest` when the Playwright report couldn't be read.
 */
export function formatPass(i) {
  const lines = [
    `CI ${i.job} job report for ${i.sha.slice(0, 7)}`, "",
    `Took: ${formatDuration(i.seconds)}`, `Load average: ${i.load.map((n) => n.toFixed(2)).join(" ")}`, "",
  ];
  if (!i.slowest) {
    lines.push("No Playwright report was readable, so there are no tests to list.");
  } else {
    if (i.flaky.length) lines.push(...flakyLines(i.flaky));
    else lines.push("Flaky tests: none.", "");
    lines.push(`The ${i.slowest.length} slowest tests:`, "", "| Test | Time |", "|---|---|");
    for (const t of i.slowest) lines.push(`| ${inline(t.name)} | ${secs(t.ms)} |`);
    lines.push("");
    const b = i.boot;
    lines.push(
      b.tests
        ? `Boot time (openTour's load and boot, ${b.tests} of ${b.all} tests; a test that never calls openTour isn't measured): median ${secs(b.median)}, total ${secs(b.total)}.`
        : `Boot time: no test recorded a boot-ms annotation (${b.all} tests ran).`,
    );
  }
  return lines.join("\n").trimEnd() + `\n\n${reportMarkerFor(i.job)}`;
}

/** The PR comment of a failed run: says so and links the failure comment, if there is one. */
export function formatFailed(i) {
  const lines = [`CI ${i.job} job report for ${i.sha.slice(0, 7)}`, "", `The ${i.job} run failed, so it reports no times.`];
  lines.push(i.failureLink ? `Why: ${i.failureLink}` : "No failure comment was found.");
  return lines.join("\n") + `\n\n${reportMarkerFor(i.job)}`;
}

/** The comment on "CI failures on main" for a passed run with flaky tests. */
export function formatMainFlaky(i) {
  const base = `${i.serverUrl}/${i.repository}`;
  const lines = [`Commit: ${base}/commit/${i.sha}`];
  if (i.runNumber) lines.push(`Run: ${base}/actions/runs/${i.runNumber}`);
  lines.push("", `CI ${i.job} job report for ${i.sha.slice(0, 7)}`, "", "The run passed.", "", ...flakyLines(i.flaky));
  return lines.join("\n").trimEnd();
}

const read = (file) => (file && existsSync(file) ? readFileSync(file, "utf8") : undefined);

/**
 * `input`: job, outcome (the run step's outcome), report, startFile, secrets, now (ms, for tests).
 * `env`: SERVER_URL, REPOSITORY, BRANCH, SHA, TOKEN, RUN_NUMBER.
 */
export async function main(input, env) {
  const secrets = input.secrets ?? [];
  const log = (m) => console.log(mask(m, secrets));
  const failed = input.outcome === "failure";
  if (!failed && input.outcome !== "success") return log(`The run step ended ${input.outcome || "unknown"}; nothing to report.`);
  const pr = await findPr(env);
  if (pr === undefined && env.BRANCH !== "main") return log(`No open PR for ${env.BRANCH}; nothing to post.`);
  const clean = (t) => mask(t, secrets);
  const sha = env.SHA;
  let parsed;
  try {
    const text = read(input.report);
    if (text) parsed = JSON.parse(text);
  } catch {
    log("Could not read the Playwright report.");
  }
  const flaky = parsed ? flakyTests(parsed).map((t) => ({ name: clean(t.name), error: clean(t.error) })) : [];
  if (pr === undefined) {
    if (failed) return log("The run failed: its failure comment names the flaky tests, so nothing more is posted on main.");
    if (!flaky.length) return log("A clean pass on main: nothing to post.");
    const issue = await findOrCreateIssue(env);
    const body = formatMainFlaky({ job: input.job, sha, serverUrl: env.SERVER_URL, repository: env.REPOSITORY, runNumber: env.RUN_NUMBER, flaky });
    await api(env, `/issues/${issue}/comments`, { method: "POST", body: JSON.stringify({ body: clean(body) }) });
    return log(`Posted ${flaky.length} flaky test(s) on main to #${issue}.`);
  }
  let text;
  if (failed) {
    const id = await findComment(env, pr, markerFor(input.job));
    text = formatFailed({ job: input.job, sha, failureLink: id === undefined ? undefined : `${env.SERVER_URL}/${env.REPOSITORY}/pulls/${pr}#issuecomment-${id}` });
  } else {
    const start = Number(read(input.startFile)?.trim());
    const now = input.now ?? Date.now();
    const m = parsed ? measure(parsed) : {};
    const slowest = m.slowest?.map((t) => ({ ...t, name: clean(t.name) }));
    text = formatPass({ job: input.job, sha, seconds: start ? now / 1000 - start : 0, load: loadavg(), flaky, slowest, boot: m.boot });
  }
  const body = JSON.stringify({ body: clean(text) });
  const earlier = await findComment(env, pr, reportMarkerFor(input.job));
  if (earlier === undefined) await api(env, `/issues/${pr}/comments`, { method: "POST", body });
  else await api(env, `/issues/comments/${earlier}`, { method: "PATCH", body });
  log(`${earlier === undefined ? "Posted" : "Updated"} the ${input.job} report on #${pr}.`);
}

/**
 * Reads JOB, OUTCOME (the run step's outcome), REPORT, START_FILE, MASK_ENV (names of env vars whose values to hide) and
 * SERVER_URL, REPOSITORY, BRANCH, SHA, TOKEN and optionally GITHUB_RUN_NUMBER. Best effort: says why it failed and returns normally.
 */
export async function cli(e) {
  try {
    const secrets = (e.MASK_ENV ?? "").split(",").filter(Boolean).map((n) => e[n]);
    await main(
      { job: e.JOB, outcome: e.OUTCOME, report: e.REPORT, startFile: e.START_FILE, secrets },
      { SERVER_URL: e.SERVER_URL, REPOSITORY: e.REPOSITORY, BRANCH: e.BRANCH, SHA: e.SHA, TOKEN: e.TOKEN, RUN_NUMBER: e.GITHUB_RUN_NUMBER },
    );
  } catch (err) {
    console.log(`Could not post the report: ${mask(String(err.message), [e.TOKEN])}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await cli(process.env);
