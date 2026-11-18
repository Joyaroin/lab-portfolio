import { describe, it, expect, afterEach, vi } from "vitest";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AUTHOR, ISSUE_MARKER, ISSUE_TITLE } from "./post-ci-failure.mjs";
import { warnSkipped } from "./staging-skipped.mjs";

const RUNS = "1111111111111111111111111111111111111111";
const HEAD = "2222222222222222222222222222222222222222";

describe("warnSkipped against a fake Forgejo", () => {
  let server;
  afterEach(() => server?.close());
  const standing = (extra = {}) => ({ number: 40, state: "open", body: `Standing.\n\n${ISSUE_MARKER}`, user: { login: AUTHOR }, ...extra });
  // failing: every call answers 500.
  async function setup({ issues = [], failing = false } = {}) {
    const calls = [];
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        if (failing) {
          res.statusCode = 500;
          return res.end("{}");
        }
        if (req.method === "POST" || req.method === "PATCH") {
          calls.push({ method: req.method, url: req.url.replace("/api/v1/repos/projects/lab", ""), body: JSON.parse(body) });
          return res.end(JSON.stringify({ number: 50 }));
        }
        res.end(JSON.stringify(issues));
      });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const env = { SERVER_URL: `http://127.0.0.1:${server.address().port}`, REPOSITORY: "projects/lab", SHA: "abcdef1234", TOKEN: "tok", RUN_NUMBER: "622" };
    return { calls, env, input: { moved: "false", seen: HEAD, runs: RUNS } };
  }
  const quiet = async (fn) => {
    const lines = [];
    const spy = vi.spyOn(console, "log").mockImplementation((m) => lines.push(m));
    try { await fn(); } finally { spy.mockRestore(); }
    return lines.join("\n");
  };

  it("on a skip, comments on the standing CI failures issue: staging didn't move, the commit it still runs, a new release is needed", async () => {
    const s = await setup({ issues: [standing()] });
    await quiet(() => warnSkipped(s.input, s.env));
    expect(s.calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST /issues/40/comments"]);
    const body = s.calls[0].body.body;
    expect(body).toMatch(/staging did not move/i);
    expect(body).toContain(`/commit/${RUNS}`);
    expect(body).toContain("/commit/abcdef1234");
    expect(body).toMatch(/new release on main/i);
    expect(body).toContain("/actions/runs/622");
  });
  it("creates the standing issue when missing, and reopens it when closed", async () => {
    const a = await setup();
    await quiet(() => warnSkipped(a.input, a.env));
    expect(a.calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST /issues", "POST /issues/50/comments"]);
    expect(a.calls[0].body.title).toBe(ISSUE_TITLE);
    expect(a.calls[0].body.body).toContain(ISSUE_MARKER);
    server.close();
    const b = await setup({ issues: [standing({ state: "closed" })] });
    await quiet(() => warnSkipped(b.input, b.env));
    expect(b.calls.map((c) => `${c.method} ${c.url}`)).toEqual(["PATCH /issues/40", "POST /issues/40/comments"]);
  });
  it("names the staging branch's head when the commit it runs can't be read, and says so when staging has no branch yet", async () => {
    const a = await setup({ issues: [standing()] });
    await quiet(() => warnSkipped({ moved: "false", seen: HEAD, runs: "" }, a.env));
    expect(a.calls[0].body.body).toContain(`/commit/${HEAD}`);
    server.close();
    const b = await setup({ issues: [standing()] });
    await quiet(() => warnSkipped({ moved: "false", seen: "", runs: "" }, b.env));
    expect(b.calls[0].body.body).toMatch(/no staging branch/i);
  });
  it.each([["staging moved", "true"], ["moved is unknown", ""]])("posts nothing when %s", async (_name, moved) => {
    const s = await setup({ issues: [standing()] });
    const log = await quiet(() => warnSkipped({ ...s.input, moved }, s.env));
    expect(s.calls).toEqual([]);
    expect(log).not.toMatch(/warning/i);
  });
  it("a failing Forgejo is logged, never thrown, and the token is not in the log", async () => {
    const s = await setup({ failing: true });
    const log = await quiet(() => warnSkipped(s.input, { ...s.env, TOKEN: "tok-planted" }));
    expect(log).toMatch(/Could not post/);
    expect(log).not.toContain("tok-planted");
  });
  it("the script process exits 0 against a Forgejo that answers 500, and against one that is unreachable", async () => {
    const s = await setup({ failing: true });
    const run = (SERVER_URL) =>
      new Promise((resolve, reject) =>
        execFile(process.execPath, [fileURLToPath(new URL("./staging-skipped.mjs", import.meta.url))],
          { env: { ...process.env, SERVER_URL, REPOSITORY: "projects/lab", TOKEN: "tok-xyz", MOVED: "false", SEEN: HEAD, RUNS, SHA: "abc" } },
          (err, so) => (err ? reject(err) : resolve(so))));
    expect(await run(s.env.SERVER_URL)).toMatch(/Could not/);
    expect(await run("http://127.0.0.1:1")).toMatch(/Could not/);
  });
});
