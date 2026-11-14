import { describe, expect, it } from "vitest";
import { newestSaved } from "./saved-gap.mjs";
import { nextSavedCommits } from "./saved-commits.mjs";

const best = { savedAt: "2026-11-05T00:00:00Z", commits: [{ sha7: "aaaaaaa", subject: "old" }] };
const read = [{ sha7: "bbbbbbb", subject: "new" }];

describe("nextSavedCommits", () => {
  it("saves commits that were read, with the time they were read", () => {
    expect(nextSavedCommits(read, best, "2026-11-06T08:00:00Z")).toEqual({ savedAt: "2026-11-06T08:00:00Z", commits: read });
  });
  it("keeps the best saved file when the read failed", () => {
    expect(nextSavedCommits(undefined, best, "2026-11-06T08:00:00Z")).toBe(best);
  });
  it("keeps a newer local file over the committed one, by savedAt", () => {
    const committed = { savedAt: "2026-11-01T00:00:00Z", commits: [] };
    expect(newestSaved(best, committed)).toBe(best);
    expect(newestSaved({ ...best, savedAt: "2026-10-01T00:00:00Z" }, committed)).toBe(committed);
  });
});
