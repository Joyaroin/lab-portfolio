import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { torontoDay, nextVersion, releaseVersion, writeImage, readImage, classify, digestFor, resolve } from "./deploy-image.mjs";

const SHA = "1111111111111111111111111111111111111111";
const OLD = "2222222222222222222222222222222222222222";
const DIGEST = `sha256:${"a".repeat(64)}`;
const OLD_DIGEST = `sha256:${"b".repeat(64)}`;

describe("torontoDay", () => {
  it("names the day in Toronto, not UTC", () => {
    // 03:30 UTC on the 21st is still the evening of the 20th in Toronto.
    expect(torontoDay(new Date("2026-11-21T03:30:00Z"))).toBe("2026.11.20");
    expect(torontoDay(new Date("2026-11-21T06:00:00Z"))).toBe("2026.11.21");
  });
});

describe("nextVersion", () => {
  it("starts each day at .1", () => {
    expect(nextVersion("2026.11.20", ["2026.11.19.1", "2026.11.19.2"])).toBe("2026.11.20.1");
  });
  it("counts on from the day's highest, numerically", () => {
    expect(nextVersion("2026.11.20", ["2026.11.20.1", "2026.11.20.10", "2026.11.20.9", "v3.0.0"])).toBe("2026.11.20.11");
  });
  it("ignores tags that only look alike", () => {
    expect(nextVersion("2026.11.20", ["2026.11.20.1-rc", "x2026.11.20.4", "2026.11.20"])).toBe("2026.11.20.1");
  });
});

describe("releaseVersion", () => {
  // A fake Forgejo tags API: pages of 50, in the order given.
  const forgejo = (names) => async (url, init) => {
    expect(init.headers.Authorization).toBe("token t0k");
    const page = Number(new URL(url).searchParams.get("page"));
    return new Response(JSON.stringify(names.slice((page - 1) * 50, page * 50).map((name) => ({ name }))), { status: 200 });
  };
  const env = { SERVER_URL: "https://git.example", REPOSITORY: "projects/lab", TOKEN: "t0k" };

  it("reads every page of tags", async () => {
    const names = [...Array.from({ length: 60 }, (_, i) => `old-${i}`), "2026.11.20.1", "2026.11.20.2"];
    expect(await releaseVersion({ env, now: new Date("2026-11-20T15:00:00Z"), fetchImpl: forgejo(names) })).toBe("2026.11.20.3");
  });
  it("fails when the tags can't be read", async () => {
    const down = async () => new Response("{}", { status: 500 });
    await expect(releaseVersion({ env, now: new Date(), fetchImpl: down })).rejects.toThrow(/500/);
  });
});

const STAGING = `# The release workflow writes the real tag on the staging branch. This copy's tag is a placeholder.
nodeName: hermit
image:
  tag: "${OLD}"
tailnet:
  enabled: true
`;

describe("writeImage", () => {
  it("writes the tag with the version as a comment, and adds the digest under it", () => {
    const out = writeImage(STAGING, { sha: SHA, digest: DIGEST, version: "2026.11.20.1" });
    expect(out).toContain(`image:\n  tag: "${SHA}"  # 2026.11.20.1\n  digest: "${DIGEST}"\ntailnet:`);
  });
  it("replaces a digest and comment already there", () => {
    const once = writeImage(STAGING, { sha: OLD, digest: OLD_DIGEST, version: "2026.11.19.1" });
    const twice = writeImage(once, { sha: SHA, digest: DIGEST, version: "2026.11.20.1" });
    expect(twice).toBe(writeImage(STAGING, { sha: SHA, digest: DIGEST, version: "2026.11.20.1" }));
    expect(twice.match(/digest:/g)).toHaveLength(1);
  });
  it("leaves the comment off when there's no version", () => {
    expect(writeImage(STAGING, { sha: SHA, digest: DIGEST })).toContain(`  tag: "${SHA}"\n  digest: "${DIGEST}"\n`);
  });
  it("keeps every other line as it was", () => {
    const out = writeImage(STAGING, { sha: SHA, digest: DIGEST, version: "2026.11.20.1" });
    const rest = (t) => t.split("\n").filter((l) => !/^\s+(tag|digest):/.test(l));
    expect(rest(out)).toEqual(rest(STAGING));
  });
  it("refuses a malformed SHA, digest or version, so nothing half-written deploys", () => {
    expect(() => writeImage(STAGING, { sha: "abc", digest: DIGEST })).toThrow(/sha/);
    expect(() => writeImage(STAGING, { sha: SHA, digest: "sha256:zz" })).toThrow(/digest/);
    expect(() => writeImage(STAGING, { sha: SHA, digest: DIGEST, version: "v1.2.3" })).toThrow(/version/);
  });
  it("refuses a file with no image tag line", () => {
    expect(() => writeImage("nodeName: hermit\n", { sha: SHA, digest: DIGEST })).toThrow(/tag/);
  });
  it("works on the real values files", () => {
    for (const f of ["deploy/values-staging.yaml", "deploy/values-production.yaml"]) {
      const out = writeImage(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), { sha: SHA, digest: DIGEST, version: "2026.11.20.1" });
      expect(readImage(out), f).toEqual({ sha: SHA, digest: DIGEST, version: "2026.11.20.1" });
    }
  });
});

describe("readImage", () => {
  it("reads back what writeImage wrote", () => {
    expect(readImage(writeImage(STAGING, { sha: SHA, digest: DIGEST, version: "2026.11.20.1" }))).toEqual({ sha: SHA, digest: DIGEST, version: "2026.11.20.1" });
  });
  it("reads a values file from before digests, with empty digest and version", () => {
    expect(readImage(STAGING)).toEqual({ sha: OLD, digest: "", version: "" });
  });
});

describe("classify", () => {
  it("knows empty, a SHA of 7 to 40 hex characters, and a release version", () => {
    expect(classify("")).toBe("empty");
    expect(classify("  ")).toBe("empty");
    expect(classify("abc1234")).toBe("sha");
    expect(classify(SHA)).toBe("sha");
    expect(classify("2026.11.20.3")).toBe("version");
  });
  it("refuses anything else before git or the registry sees it", () => {
    for (const bad of ["abc12", "ABC1234", "a".repeat(41), "v1.2.3", "2026.11.20", "main", "1111111; rm -rf /", "2026.11.20.1\n"]) {
      expect(() => classify(bad), JSON.stringify(bad)).toThrow(/version/);
    }
  });
});

describe("digestFor", () => {
  // A fake registry: a token endpoint, then a manifest HEAD that knows one tag.
  const registry = (known) => async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === "/v2/token") {
      expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("adham:pw").toString("base64")}`);
      expect(u.searchParams.get("scope")).toBe("repository:projects/lab:pull");
      return new Response(JSON.stringify({ token: "bearer1" }), { status: 200 });
    }
    expect(init.method).toBe("HEAD");
    expect(init.headers.Authorization).toBe("Bearer bearer1");
    const tag = u.pathname.split("/manifests/")[1];
    return tag === known ? new Response(null, { status: 200, headers: { "docker-content-digest": DIGEST } }) : new Response(null, { status: 404 });
  };
  const args = { image: "git.example/projects/lab", user: "adham", token: "pw" };

  it("asks the registry for the tag's digest", async () => {
    expect(await digestFor({ ...args, tag: SHA, fetchImpl: registry(SHA) })).toBe(DIGEST);
  });
  it("says so when the image is gone, for example cleaned up", async () => {
    await expect(digestFor({ ...args, tag: OLD, fetchImpl: registry(SHA) })).rejects.toThrow(/no image .*2222222/);
  });
});

describe("resolve", () => {
  // git as promote's checkout sees it: one release tag on SHA, staging's values file, and OLD with no tag.
  const git = {
    revParse: (ref) => ({ [SHA]: SHA, [SHA.slice(0, 7)]: SHA, [OLD]: OLD, "refs/tags/2026.11.20.1": SHA }[ref] ?? null),
    tagsAt: (sha) => (sha === SHA ? ["v-something", "2026.11.20.1"] : []),
    show: (ref) => (ref === "origin/staging:deploy/values-staging.yaml" ? writeImage(STAGING, { sha: SHA, digest: DIGEST, version: "2026.11.20.1" }) : null),
  };
  const lookups = [];
  const digest = async (tag) => (lookups.push(tag), tag === SHA ? DIGEST : OLD_DIGEST);

  it("empty means what staging runs, digest and version included", async () => {
    expect(await resolve("", { git, digestFor: digest })).toEqual({ sha: SHA, digest: DIGEST, version: "2026.11.20.1" });
  });
  it("a version means its tag's commit, with that commit's digest from the registry", async () => {
    expect(await resolve("2026.11.20.1", { git, digestFor: digest })).toEqual({ sha: SHA, digest: DIGEST, version: "2026.11.20.1" });
  });
  it("a short SHA becomes the full one, and gets the release version that tags it", async () => {
    expect(await resolve(SHA.slice(0, 7), { git, digestFor: digest })).toEqual({ sha: SHA, digest: DIGEST, version: "2026.11.20.1" });
  });
  it("a commit from before release versions gets no version", async () => {
    expect(await resolve(OLD, { git, digestFor: digest })).toEqual({ sha: OLD, digest: OLD_DIGEST, version: "" });
  });
  it("staging from before digests gets its digest from the registry", async () => {
    const before = { ...git, show: () => STAGING };
    expect(await resolve("", { git: before, digestFor: digest })).toEqual({ sha: OLD, digest: OLD_DIGEST, version: "" });
  });
  it("fails clearly on an unknown version or commit, or no staging branch", async () => {
    await expect(resolve("2026.11.20.9", { git, digestFor: digest })).rejects.toThrow(/2026\.11\.20\.9/);
    await expect(resolve("abcdef1", { git, digestFor: digest })).rejects.toThrow(/abcdef1/);
    await expect(resolve("", { git: { ...git, show: () => null }, digestFor: digest })).rejects.toThrow(/staging/);
  });
});

// The workflows and chart are read as text: the repo has no YAML parser. A job is the block from its key to the next two-space key.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const jobOf = (text, name) => text.slice(text.indexOf(`\n  ${name}:\n`) + 1).split(/\n  (?=[a-z-]+:\n)/)[0];

describe("release.yml deploys by digest", () => {
  const yml = read(".forgejo/workflows/release.yml");
  it("the gate job works out the release version and passes it on", () => {
    const gate = jobOf(yml, "gate");
    expect(gate).toContain("node scripts/deploy-image.mjs version");
    expect(gate).toMatch(/^      version: \$\{\{ steps\.version\.outputs\.version \}\}$/m);
    expect(gate).toContain("TOKEN: ${{ secrets.GITHUB_TOKEN }}");
  });
  it("the image job records the digest kaniko pushed, and labels the image with its commit, source and version", () => {
    const image = jobOf(yml, "image");
    expect(image).toContain("--digest-file");
    expect(image).toMatch(/^      digest: \$\{\{ steps\.build\.outputs\.digest \}\}$/m);
    expect(image).toMatch(/^      version: \$\{\{ steps\.build\.outputs\.version \}\}$/m);
    expect(image).toContain("VERSION: ${{ needs.gate.outputs.version }}");
    for (const label of ["org.opencontainers.image.revision", "org.opencontainers.image.source", "org.opencontainers.image.version", "org.opencontainers.image.created"]) {
      expect(image, label).toContain(`--label "${label}=`);
    }
  });
  it("the staging job writes the tag, digest and version through the script, and tags the commit", () => {
    const staging = jobOf(yml, "staging");
    expect(staging).toContain('node scripts/deploy-image.mjs write deploy/values-staging.yaml "$SHA" "$DIGEST" "$VERSION"');
    expect(staging).toContain("DIGEST: ${{ needs.image.outputs.digest }}");
    expect(staging).toContain("VERSION: ${{ needs.image.outputs.version }}");
    expect(staging).not.toMatch(/sed -i[^\n]*tag:/);
    expect(staging).toContain('git push origin "refs/tags/$VERSION"');
  });
});

describe("promote.yml deploys by digest", () => {
  const yml = read(".forgejo/workflows/promote.yml");
  it("resolves the input through the script, which asks the registry with the org's token", () => {
    // Copied aside first: the target commit may predate the script.
    expect(yml).toContain('cp scripts/deploy-image.mjs "$RUNNER_TEMP/deploy-image.mjs"');
    expect(yml).toContain('node "$RUNNER_TEMP/deploy-image.mjs" resolve "$INPUT_VERSION"');
    expect(yml).toContain("REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}");
    expect(yml).toContain("IMAGE: git.tailf69bc5.ts.net/projects/lab");
  });
  it("writes production's values through the script, never with sed", () => {
    expect(yml).toContain('node "$RUNNER_TEMP/deploy-image.mjs" write deploy/values-production.yaml "$sha" "$digest" "$version"');
    expect(yml).not.toMatch(/sed -i[^\n]*tag:/);
  });
});

describe("the chart runs the image by digest", () => {
  it("appends @<digest> to the image when the values give one", () => {
    expect(read("deploy/chart/templates/deployment.yaml")).toContain('{{ .Values.image.tag | default "none" }}{{ with .Values.image.digest }}@{{ . }}{{ end }}"');
  });
  it("defaults the digest to empty, so a values file without one still renders", () => {
    expect(read("deploy/chart/values.yaml")).toMatch(/^image:\n  registry: [^\n]+\n  tag: ""\n(?:  #[^\n]*\n)*  digest: ""$/m);
  });
});
