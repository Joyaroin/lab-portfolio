// The release clock: warns when a release takes over 6 minutes to move staging.
//   node scripts/release-clock.mjs retried   after the browser job's tests: writes `retried=true|false` and `load=<1/5/15 min>`
//                                            to $GITHUB_OUTPUT (no `retried` line if the report can't be read)
//   node scripts/release-clock.mjs warn      in staging, after the push: posts the warning if the rule says so
// The rule is one pure function, shouldWarn. It never blocks anything: every failure is logged and the process exits 0.
// The warning is a comment on the standing "Browser job times" issue (created or reopened like "CI failures on main").
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { loadavg } from "node:os";
import { fileURLToPath } from "node:url";
import { api, findOrCreateStandingIssue, formatDuration, mask } from "./post-ci-failure.mjs";

export const LIMIT_SECONDS = 360;
export const TIMES_ISSUE_TITLE = "Browser job times";
export const TIMES_ISSUE_MARKER = "<!-- ci-browser-job-times -->";

/** True when any test in a Playwright JSON report ran more than once, whether it ended flaky or unexpected. */
export function retried(report) {
  const walk = (suite) =>
    (suite.specs ?? []).some((spec) => (spec.tests ?? []).some((t) => (t.results?.length ?? 0) > 1)) || (suite.suites ?? []).some(walk);
  return (report.suites ?? []).some(walk);
}

/** The rule: warn exactly when staging moved, no test was retried and the release clock is over 360 s. */
export const shouldWarn = ({ moved, retried: wasRetried, seconds }) => moved && !wasRetried && seconds > LIMIT_SECONDS;

/** Writes the browser job's `retried` and `load` outputs. Reads REPORT, writes to GITHUB_OUTPUT. Never throws. */
export function recordFacts(e) {
  const lines = [`load=${loadavg().map((n) => n.toFixed(2)).join(" ")}`];
  try {
    if (!e.REPORT || !existsSync(e.REPORT)) throw new Error("no report");
    lines.push(`retried=${retried(JSON.parse(readFileSync(e.REPORT, "utf8")))}`);
  } catch {
    console.log("Could not read the Playwright report; leaving the retried output empty, so no warning.");
  }
  if (e.GITHUB_OUTPUT) appendFileSync(e.GITHUB_OUTPUT, lines.join("\n") + "\n");
}

const seconds = (v) => {
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? n : undefined;
};

/** The release run's start in epoch seconds, from the runs API. The id is the API's, not the run number. */
async function runStart(env) {
  const run = await api(env, `/actions/runs/${env.RUN_ID}`);
  const ms = Date.parse(run.started);
  if (!Number.isFinite(ms) || ms <= 0) throw new Error("the run has no started time");
  return ms / 1000;
}

/**
 * `input`: moved, retried ("true" or "false"), browserStart and imageStart (epoch seconds), ended (epoch seconds, when the
 * staging push ended), load. `env`: SERVER_URL, REPOSITORY, TOKEN, RUN_ID (the API's run id), RUN_NUMBER, SHA.
 * Reads the run's start from the runs API; if the job's token can't read it, uses the earliest of the image and browser
 * job starts. Logs and returns on any failure.
 */
export async function warn(input, env) {
  try {
    const log = (m) => console.log(mask(m, [env.TOKEN]));
    const end = seconds(input.ended);
    if (input.moved !== "true") return log("Staging did not move, so no release clock warning.");
    if (input.retried !== "true" && input.retried !== "false") return log("Not known whether a test was retried, so no release clock warning.");
    if (!end) return log("No end time for the staging push, so no release clock warning.");
    let start;
    let source = "the run's start";
    try {
      start = await runStart(env);
    } catch (err) {
      log(`Could not read the run's start: ${err.message}. Using the earliest job start.`);
      const jobs = [seconds(input.browserStart), seconds(input.imageStart)].filter(Boolean);
      if (!jobs.length) return log("There is no start time to measure from, so no release clock warning.");
      start = Math.min(...jobs);
      source = "the earliest of the image and browser job starts";
    }
    const clock = end - start;
    const wait = seconds(input.browserStart) ? Math.max(0, Math.round(seconds(input.browserStart) - start)) : undefined;
    log(`Release clock ${Math.round(clock)} s from ${source}; limit ${LIMIT_SECONDS} s.`);
    if (!shouldWarn({ moved: true, retried: input.retried === "true", seconds: clock })) return;
    const base = `${env.SERVER_URL}/${env.REPOSITORY}`;
    const lines = [
      `Release took ${formatDuration(clock)}, over the ${formatDuration(LIMIT_SECONDS)} limit.`, "",
      `Commit: ${base}/commit/${env.SHA}`,
      ...(env.RUN_NUMBER ? [`Run: ${base}/actions/runs/${env.RUN_NUMBER}`] : []), "",
      `Release clock: ${formatDuration(clock)} (${Math.round(clock)} s), from ${source} to the end of the staging push`,
      `Browser job load average: ${input.load || "unknown"}`,
      `Runner wait: ${wait === undefined ? "unknown" : `${wait} s`} (the browser job's start minus ${source})`,
    ];
    try {
      const issue = await findOrCreateStandingIssue(env, {
        title: TIMES_ISSUE_TITLE, marker: TIMES_ISSUE_MARKER, intro: "Every release that takes over 6 minutes to move staging is posted here as a comment.",
      });
      await api(env, `/issues/${issue}/comments`, { method: "POST", body: JSON.stringify({ body: lines.join("\n") }) });
      log(`Posted the release clock warning to #${issue}.`);
    } catch (err) {
      log(`Could not post the release clock warning: ${err.message}`);
    }
  } catch (err) {
    console.log(`Release clock check failed: ${mask(String(err.message), [env.TOKEN])}`);
  }
}

/** Reads MOVED, RETRIED, BROWSER_START, IMAGE_START, ENDED, LOAD and SERVER_URL, REPOSITORY, TOKEN, RUN_ID, RUN_NUMBER, SHA. */
export async function cli(mode, e) {
  if (mode === "retried") return recordFacts(e);
  if (mode === "warn")
    return warn(
      { moved: e.MOVED, retried: e.RETRIED, browserStart: e.BROWSER_START, imageStart: e.IMAGE_START, ended: e.ENDED, load: e.LOAD },
      { SERVER_URL: e.SERVER_URL, REPOSITORY: e.REPOSITORY, TOKEN: e.TOKEN, RUN_ID: e.RUN_ID, RUN_NUMBER: e.RUN_NUMBER, SHA: e.SHA },
    );
  console.log(`Unknown mode ${mode}; use retried or warn.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await cli(process.argv[2], process.env);
