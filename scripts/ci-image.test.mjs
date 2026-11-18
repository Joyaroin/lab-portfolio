// The CI image (ci/Dockerfile) that release.yml's browser jobs run in. Its tag is the Dockerfile's hash, so a changed
// Dockerfile gets a new tag: a run on a branch can't replace the image main's release uses, and the runner, which keeps
// an image it has pulled, never runs a stale copy under the same tag. The Playwright version in it follows package-lock.json,
// so a Playwright bump brings a new image with the browser and system packages it needs.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dockerfile = read("ci/Dockerfile");
const yml = read(".forgejo/workflows/release.yml");
// The workflows are read as text: the repo has no YAML parser. A job is the block from its key to the next two-space key.
const jobIn = (name) => yml.slice(yml.indexOf(`\n  ${name}:\n`) + 1).split(/\n  (?=[a-z-]+:\n)/)[0];
const IMAGE = "git.tailf69bc5.ts.net/projects/lab-ci";

describe("the CI image", () => {
  const tag = `ci-${createHash("sha256").update(dockerfile).digest("hex").slice(0, 12)}`;
  it("is named in release.yml by the Dockerfile's hash, by the job that builds it and by both browser jobs", () => {
    const named = [...yml.matchAll(/projects\/lab-ci:([\w.-]+)/g)].map((m) => m[1]);
    expect(named, `ci/Dockerfile changed: its tag is now ${tag}`).toEqual([tag, tag, tag]);
    expect(jobIn("ci-image")).toContain(`IMAGE: ${IMAGE}:${tag}`);
    for (const job of ["browser", "browser-light"]) expect(jobIn(job), job).toContain(`      image: ${IMAGE}:${tag}`);
  });
  it("holds the Playwright version package-lock.json installs", () => {
    const locked = JSON.parse(read("package-lock.json")).packages["node_modules/@playwright/test"].version;
    expect(dockerfile).toMatch(new RegExp(`^ARG PLAYWRIGHT_VERSION=${locked.replaceAll(".", "\\.")}$`, "m"));
  });
  it("is built before the release specs run: browser needs the ci-image job, which needs the gate", () => {
    expect(jobIn("ci-image")).toMatch(/^    needs: gate$/m);
    expect(jobIn("browser")).toMatch(/^    needs: ci-image$/m);
  });
});
