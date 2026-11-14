import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCommits, readCommits, COMMITS_LIMIT } from "./commits";
import { hasPhoneNumber, hasPrivateAddress } from "./content";

// Shaped like GitHub's list-commits response: newest first, a parents array on each item.
const item = (n: number, message: string, parents = 1) => ({
  sha: n.toString(16).padStart(40, "a"),
  commit: { message },
  parents: Array.from({ length: parents }, (_, i) => ({ sha: `p${i}` })),
});
const fixture = Array.from({ length: 50 }, (_, i) =>
  item(i, i % 4 === 3 ? `Merge pull request #${i}` : `Change ${i}\n\nA body line that is not kept.`, i % 4 === 3 ? 2 : 1),
);

describe("parseCommits", () => {
  it("drops merges and keeps the newest 25, in order", () => {
    const out = parseCommits(fixture);
    expect(out).toHaveLength(COMMITS_LIMIT);
    expect(COMMITS_LIMIT).toBe(25);
    expect(out.every((c) => !c.subject.startsWith("Merge"))).toBe(true);
    expect(out[0]).toEqual({ sha7: "aaaaaaa", subject: "Change 0" });
    expect(out[1].subject).toBe("Change 1");
    expect(out[3].subject).toBe("Change 4"); // 3 was a merge
  });
  it("cuts each subject to its first line and trims it", () => {
    expect(parseCommits([item(1, "  Fix the thing  \n\nbody")])[0].subject).toBe("Fix the thing");
  });
  it("uses the first seven characters of the hash", () => {
    expect(parseCommits([{ ...item(1, "x"), sha: "0123456789abcdef" }])[0].sha7).toBe("0123456");
  });
  it("drops a subject with a phone number", () => {
    const out = parseCommits([item(1, "Call 613-555-0142 now"), item(2, "Fine")]);
    expect(out.map((c) => c.subject)).toEqual(["Fine"]);
  });
  it("drops a subject with a private address", () => {
    const out = parseCommits([item(1, "Point at 192.168.1.5"), item(2, "Use nas.ts.net"), item(3, "Fine")]);
    expect(out.map((c) => c.subject)).toEqual(["Fine"]);
  });
  it("does not apply the live-status word check", () => {
    expect(parseCommits([item(1, "Synced and Ready, 42 passing")])).toHaveLength(1);
  });
  it("fills the 25 from later commits when one is dropped", () => {
    const body = [item(0, "Call 613-555-0142"), ...Array.from({ length: 30 }, (_, i) => item(i + 1, `c${i}`))];
    const out = parseCommits(body);
    expect(out).toHaveLength(25);
    expect(out[0].subject).toBe("c0");
  });
  it("gives an empty list for malformed items", () => {
    expect(parseCommits([{}, null, { sha: "abc" }] as unknown[])).toEqual([]);
  });
});

describe("readCommits", () => {
  const ok = (body: unknown): typeof fetch => async () => new Response(JSON.stringify(body), { status: 200 });
  it("returns the parsed commits for a good response", async () => {
    const r = await readCommits(ok(fixture), "https://example.test/c");
    expect(r?.length).toBe(25);
  });
  it("asks the url it was given", async () => {
    let asked = "";
    await readCommits(async (u) => { asked = String(u); return new Response("[]"); }, "https://example.test/c");
    expect(asked).toBe("https://example.test/c");
  });
  it("is undefined on an HTTP error, a non-list, an empty list or a thrown fetch", async () => {
    const status = (s: number): typeof fetch => async () => new Response("{}", { status: s });
    expect(await readCommits(status(403), "u")).toBeUndefined();
    expect(await readCommits(ok({ message: "rate limit" }), "u")).toBeUndefined();
    expect(await readCommits(ok([]), "u")).toBeUndefined();
    expect(await readCommits(async () => { throw new Error("offline"); }, "u")).toBeUndefined();
  });
  it("gives up after the timeout", async () => {
    const hang: typeof fetch = (_u, init) =>
      new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
    expect(await readCommits(hang, "u", 10)).toBeUndefined();
  });
});

describe("the committed fallback", () => {
  const saved = JSON.parse(readFileSync(new URL("./commits-saved.json", import.meta.url), "utf8"));
  it("has a date and 25 commits", () => {
    expect(Number.isNaN(Date.parse(saved.savedAt))).toBe(false);
    expect(saved.commits).toHaveLength(25);
  });
  it("holds only a 7-character hash and a one-line subject, and passes the content checks", () => {
    for (const c of saved.commits) {
      expect(Object.keys(c).sort()).toEqual(["sha7", "subject"]);
      expect(c.sha7).toMatch(/^[0-9a-f]{7}$/);
      expect(c.subject).toBe(c.subject.trim());
      expect(c.subject).not.toMatch(/\n/);
      expect(c.subject.length).toBeGreaterThan(0);
      expect(hasPhoneNumber(c.subject)).toBe(false);
      expect(hasPrivateAddress(c.subject)).toBe(false);
    }
  });
});
