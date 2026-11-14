// Saves this site's latest commits into the local file (see saved-commits.mjs). The build can use
// it in place of the committed src/commits-saved.json (see vite.config.ts). If the call fails, the
// newer of the old local file and the committed one stays. COMMITS_API replaces the API URL, for
// tests and the offline run.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";
import { newestSaved } from "./saved-gap.mjs";
import { LOCAL_COMMITS, nextSavedCommits } from "./saved-commits.mjs";

// commits.ts is TypeScript, so load it through Vite rather than keep a second copy of the logic.
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const { readCommits, COMMITS_URL } = await vite.ssrLoadModule("/src/commits.ts");
await vite.close();

const read = (u) => (existsSync(u) ? JSON.parse(readFileSync(u, "utf8")) : undefined);
const committed = read(new URL("../src/commits-saved.json", import.meta.url));
const best = newestSaved(read(LOCAL_COMMITS), committed);
const commits = await readCommits(fetch, process.env.COMMITS_API || COMMITS_URL);
if (commits) console.log(`saved commits: ${commits.length}, newest ${commits[0].sha7}`);
else console.warn("could not read the commits; keeping the newest saved file");
writeFileSync(LOCAL_COMMITS, JSON.stringify(nextSavedCommits(commits, best, new Date().toISOString()), null, 2) + "\n");
