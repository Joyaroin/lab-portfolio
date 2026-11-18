// The staging job's skipped case: a hand-started release whose commit main has moved past doesn't push, and still passes. Since releases
// start only by hand, nothing later moves staging, so this says so on the standing "CI failures on main" issue (found or created the way
// the failure posts find it).
//   node scripts/staging-skipped.mjs   reads MOVED, SEEN, RUNS and SERVER_URL, REPOSITORY, TOKEN, SHA, RUN_NUMBER
// Like scripts/release-clock.mjs it is best effort: every failure is logged and the process exits 0, so it can't change the run's result.
import { fileURLToPath } from "node:url";
import { api, findOrCreateIssue, mask } from "./post-ci-failure.mjs";

/**
 * `input`: moved ("true" or "false", the move step's output), seen (the staging branch's head, "" when there is no staging branch) and
 * runs (the commit that head deploys, read from its image tag, "" when unreadable). `env`: SERVER_URL, REPOSITORY, TOKEN, SHA, RUN_NUMBER.
 * Posts only when moved is exactly "false". Logs and returns on any failure.
 */
export async function warnSkipped(input, env) {
  const log = (m) => console.log(mask(m, [env.TOKEN]));
  try {
    if (input.moved !== "false") return;
    const base = `${env.SERVER_URL}/${env.REPOSITORY}`;
    const still = input.runs || input.seen;
    const lines = [
      "Staging did not move: main has moved past the commit of this release, so it was out of date and pushed nothing.",
      "",
      `Release commit: ${base}/commit/${env.SHA}`,
      ...(env.RUN_NUMBER ? [`Run: ${base}/actions/runs/${env.RUN_NUMBER}`] : []),
      still ? `Staging still runs: ${base}/commit/${still}` : "Staging still runs: nothing new (there is no staging branch yet).",
      ...(input.runs && input.seen ? [`Staging branch head: ${base}/commit/${input.seen}`] : []),
      "",
      "A new release on main is needed to move staging: releases start only by hand, so nothing else will.",
    ];
    try {
      const issue = await findOrCreateIssue(env);
      await api(env, `/issues/${issue}/comments`, { method: "POST", body: JSON.stringify({ body: lines.join("\n") }) });
      log(`Posted that staging did not move to #${issue}.`);
    } catch (err) {
      log(`Could not post that staging did not move: ${err.message}`);
    }
  } catch (err) {
    log(`Staging skipped check failed: ${err.message}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const e = process.env;
  await warnSkipped(
    { moved: e.MOVED, seen: e.SEEN, runs: e.RUNS },
    { SERVER_URL: e.SERVER_URL, REPOSITORY: e.REPOSITORY, TOKEN: e.TOKEN, SHA: e.SHA, RUN_NUMBER: e.RUN_NUMBER },
  );
}
