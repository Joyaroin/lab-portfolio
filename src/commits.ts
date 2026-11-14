import { hasPhoneNumber, hasPrivateAddress } from "./content";

// This site's latest commits, for the git-log ambient screen (#280). The build reads them from the
// public GitHub mirror (scripts/save-commits.mjs), because the production image has no .git.
// Nothing here runs in the browser: the saved file is all a visitor gets.
export const COMMITS_URL = "https://api.github.com/repos/Joyaroin/lab-portfolio/commits?sha=main&per_page=50";
export const COMMITS_LIMIT = 25;
export const COMMITS_TIMEOUT_MS = 5000;

export type SavedCommit = { sha7: string; subject: string };
export type SavedCommits = { savedAt: string; commits: SavedCommit[] };

/** The commits on GitHub's list, newest first: no merges (more than one parent), the first line of
 *  each message, the first 7 characters of each hash. A subject with a phone number or a private
 *  address is dropped, as the content check does. The live-status word check doesn't apply here.
 *  Returns the newest `COMMITS_LIMIT` that remain. */
export function parseCommits(body: unknown[]): SavedCommit[] {
  const out: SavedCommit[] = [];
  for (const item of body) {
    const c = item as { sha?: unknown; commit?: { message?: unknown }; parents?: unknown } | null;
    if (typeof c?.sha !== "string" || typeof c.commit?.message !== "string") continue;
    if (!Array.isArray(c.parents) || c.parents.length !== 1) continue;
    const subject = c.commit.message.split("\n")[0].trim();
    if (!subject || hasPhoneNumber(subject) || hasPrivateAddress(subject)) continue;
    out.push({ sha7: c.sha.slice(0, 7), subject });
    if (out.length === COMMITS_LIMIT) break;
  }
  return out;
}

/** The parsed commits, or undefined if the call failed or gave nothing usable. */
export async function readCommits(
  fetchFn: typeof fetch,
  url: string,
  timeoutMs = COMMITS_TIMEOUT_MS,
): Promise<SavedCommit[] | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { headers: { Accept: "application/vnd.github+json" }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: unknown = await res.json();
    if (!Array.isArray(body)) throw new Error("unexpected response");
    const commits = parseCommits(body);
    return commits.length > 0 ? commits : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
