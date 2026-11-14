// The saved commits: what the git-log ambient screen shows (src/commits.ts). The build writes the
// latest to the local file below, which git ignores (.gitignore lists it too), so a build never
// changes a tracked file. vite.config.ts and save-commits.mjs both use this. The newer-wins rule
// is newestSaved in saved-gap.mjs: both files are dated by savedAt.
export const LOCAL_COMMITS = new URL("../src/commits-saved.local.json", import.meta.url);

/** What to write: the commits just read, dated `now` (an ISO time), or the best saved file if the read failed. */
export function nextSavedCommits(commits, best, now) {
  return commits ? { savedAt: now, commits } : best;
}
