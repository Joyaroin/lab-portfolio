// The CI image (ci/Dockerfile) that release.yml's browser jobs and ci.yml's screenshots job run in. adham/ci's build-ci-image workflow builds it,
// only when the registry lacks its tag: ci- and a hash of the files in ci/, so a branch with a changed Dockerfile
// gets a tag of its own and the runner, which keeps an image it has pulled, never runs a stale copy under the same
// tag. The workflow outputs the image name, so no tag is written into release.yml. The Playwright version in the
// image follows package-lock.json, and its base is pinned by digest.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dockerfile = read("ci/Dockerfile");
const yml = read(".forgejo/workflows/release.yml");
const ci = read(".forgejo/workflows/ci.yml");
// The workflows are read as text: the repo has no YAML parser. A job is the block from its key to the next two-space key.
const jobOf = (text, name) => text.slice(text.indexOf(`\n  ${name}:\n`) + 1).split(/\n  (?=[a-z-]+:\n)/)[0];
const jobIn = (name) => jobOf(yml, name);
const ciJob = (name) => jobOf(ci, name);
const IMAGE = "git.tailf69bc5.ts.net/projects/lab-ci";
const FROM_OUTPUT = "${{ needs.ci-image.outputs.image }}";

describe("the CI image", () => {
  it("is built by adham/ci's build-ci-image at a pinned release, from ci/, as projects/lab-ci", () => {
    const job = jobIn("ci-image");
    expect(job).toMatch(/^    uses: adham\/ci\/\.forgejo\/workflows\/build-ci-image\.yml@v\d+\.\d+\.\d+$/m);
    expect(job).toContain(`      image: ${IMAGE}\n`);
    expect(job).toContain("      context: ci\n");
    expect(job).toContain("      registry-token: ${{ secrets.REGISTRY_TOKEN }}");
  });
  it("is named in both browser jobs by the ci-image job's output, with no tag written into release.yml", () => {
    for (const job of ["browser", "browser-light"]) expect(jobIn(job), job).toContain(`      image: ${FROM_OUTPUT}\n`);
    expect(yml).not.toMatch(/lab-ci:ci-/);
  });
  it("holds the Playwright version package-lock.json installs", () => {
    const locked = JSON.parse(read("package-lock.json")).packages["node_modules/@playwright/test"].version;
    expect(dockerfile).toMatch(new RegExp(`^ARG PLAYWRIGHT_VERSION=${locked.replaceAll(".", "\\.")}$`, "m"));
  });
  it("starts from a base pinned by digest", () => {
    expect(dockerfile).toMatch(/^FROM [^\s@]+@sha256:[0-9a-f]{64}$/m);
  });
  it("is built before the specs run: browser and browser-light need the ci-image job, which needs the gate", () => {
    expect(jobIn("ci-image")).toMatch(/^    needs: gate$/m);
    expect(jobIn("browser")).toMatch(/^    needs: ci-image$/m);
    expect(jobIn("browser-light")).toMatch(/^    needs: \[staging, ci-image\]$/m);
  });
});

describe("the CI image in ci.yml", () => {
  it("is built by the same build-ci-image call as the release, after ci.yml's gate job", () => {
    const job = ciJob("ci-image");
    expect(job).toMatch(/^    needs: gate$/m);
    expect(job).toContain(`      image: ${IMAGE}\n`);
    expect(job).toContain("      context: ci\n");
    expect(job).toContain("      registry-token: ${{ secrets.REGISTRY_TOKEN }}");
    const versions = [...`${ci}\n${yml}`.matchAll(/build-ci-image\.yml@(v\d+\.\d+\.\d+)/g)].map((m) => m[1]);
    expect(versions).toHaveLength(2);
    expect(new Set(versions).size).toBe(1);
  });
  it("is what the screenshots job runs in, so it installs no system packages", () => {
    const shots = ciJob("screenshots");
    expect(shots).toMatch(/^    needs: ci-image$/m);
    expect(shots).toContain(`      image: ${FROM_OUTPUT}\n`);
    expect(shots).toContain("        password: ${{ secrets.REGISTRY_TOKEN }}");
    expect(shots).not.toMatch(/apt-get|--with-deps/);
  });
});
