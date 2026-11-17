// The runner gate: a release job is the only job running on the CI runner (#361).
// Forgejo has no exclusive job and a job can't pause the runner, so every job in ci.yml and release.yml starts with a gate step
// that reads Forgejo's task list and waits:
//   node scripts/runner-gate.mjs release   a release job waits until no other job is running that started before it and isn't part of its run
//   node scripts/runner-gate.mjs ci        a CI job waits while a release job that started before it is running
// Both rules look only at jobs that started earlier, in one total order (start second, then release before anything else, then task id).
// A job therefore only ever waits for a job ahead of it, so two jobs can't wait for each other, even when they start in the same second.
// The one rule is the pure function `decide`. Polls every 10 s; after 60 minutes of waiting the job fails, saying what it waited for.
import { fileURLToPath } from "node:url";
import { api, mask } from "./post-ci-failure.mjs";

export const POLL_SECONDS = 10;
export const WAIT_LIMIT_SECONDS = 3600;
const MAX_FAILED_READS = 3;
const PAGE = 50;
const MAX_PAGES = 10;
const RELEASE = "release.yml";
const MODES = { release: RELEASE, ci: "ci.yml" };

const started = (t) => Date.parse(t.run_started_at) / 1000;
const isRelease = (t) => t.workflow_id === RELEASE;
const label = (t) => `${t.workflow_id} #${t.run_number} ${t.name}`;

/** Where a job stands in the one order: earlier start first; in the same second a release job comes before any other; then the lower task id. */
const order = (t) => [started(t), isRelease(t) ? 0 : 1, t.id];
function before(a, b) {
  const x = order(a);
  const y = order(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}

/**
 * The rule. `tasks`: Forgejo's task list (only status "running" counts). `run`: the asking job, as { workflow, runNumber, job }: it
 * must be one of the running tasks, and gives the job's own start. Returns { wait, blockers, self, kind }.
 * A release job is blocked by any running job that is ahead of it and isn't in its own run. A CI job is blocked by any running
 * release job that is ahead of it.
 */
export function decide({ tasks, run }) {
  const running = tasks.filter((t) => t.status === "running");
  const isSelf = (t) => t.workflow_id === run.workflow && String(t.run_number) === String(run.runNumber);
  const self = running.filter((t) => isSelf(t) && t.name === run.job).sort((a, b) => b.id - a.id)[0];
  if (!self) throw new Error(`${run.workflow} #${run.runNumber} ${run.job} is not in the list of running tasks`);
  const kind = isRelease(self) ? "release" : "ci";
  const blockers = running.filter((t) => !isSelf(t) && before(t, self) && (kind === "release" || isRelease(t)));
  return { wait: blockers.length > 0, blockers, self, kind };
}

const KIND_NAME = { release: "release job", ci: "CI job" };
const names = (blockers) => [...new Set(blockers.map(label))].join(", ");

/**
 * Waits until `decide` says go. `fetchTasks()` returns the task list; `now()` and `sleep(seconds)` are the clock (injected for tests).
 * Logs one line when it goes, saying what it waited for and for how long. Throws after WAIT_LIMIT_SECONDS of waiting, or after
 * MAX_FAILED_READS failed reads in a row.
 */
export async function gate({ fetchTasks, run, now = () => Date.now() / 1000, sleep = (s) => new Promise((r) => setTimeout(r, s * 1000)), log = console.log }) {
  const begin = now();
  const waitedFor = new Map();
  let failed = 0;
  for (;;) {
    let result;
    try {
      result = decide({ tasks: await fetchTasks(), run });
      failed = 0;
    } catch (err) {
      if (++failed >= MAX_FAILED_READS) throw new Error(`runner gate: could not read the task list ${failed} times in a row: ${err.message}`);
      log(`runner gate: read failed (${err.message}); trying again`);
      await sleep(POLL_SECONDS);
      continue;
    }
    const waited = Math.round(now() - begin);
    if (!result.wait) {
      log(waited > 0
        ? `runner gate: ${KIND_NAME[result.kind]} waited ${waited} s for ${names([...waitedFor.values()])}, then went`
        : `runner gate: ${KIND_NAME[result.kind]} did not wait`);
      return { waited, kind: result.kind };
    }
    if (!waitedFor.size) log(`runner gate: ${KIND_NAME[result.kind]} waiting for ${names(result.blockers)}`);
    for (const t of result.blockers) waitedFor.set(t.id, t);
    if (waited + POLL_SECONDS > WAIT_LIMIT_SECONDS) {
      await sleep(Math.max(0, WAIT_LIMIT_SECONDS - waited));
      throw new Error(`runner gate: gave up after ${WAIT_LIMIT_SECONDS} s waiting for ${names(result.blockers)}`);
    }
    await sleep(POLL_SECONDS);
  }
}

/** The running tasks, newest first, as Forgejo returns them. Takes the page size's worth at a time. */
async function runningTasks(env) {
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await api(env, `/actions/tasks?status=running&limit=${PAGE}&page=${page}`);
    const batch = res.workflow_runs ?? [];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

/** Reads SERVER_URL, REPOSITORY, TOKEN, RUN_NUMBER and JOB. `mode` is release or ci. Throws when the gate fails; run as a command, that exits 1. `opts` replaces the clock, for tests. */
export async function cli(mode, e, opts = {}) {
  const workflow = MODES[mode];
  if (!workflow) throw new Error(`Unknown mode ${mode}; use release or ci.`);
  const env = { SERVER_URL: e.SERVER_URL, REPOSITORY: e.REPOSITORY, TOKEN: e.TOKEN };
  await gate({ fetchTasks: () => runningTasks(env), run: { workflow, runNumber: e.RUN_NUMBER, job: e.JOB }, log: (m) => console.log(mask(m, [e.TOKEN])), ...opts });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await cli(process.argv[2], process.env);
  } catch (err) {
    console.log(mask(String(err.message), [process.env.TOKEN]));
    process.exit(1);
  }
}
