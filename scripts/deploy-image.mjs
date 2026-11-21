// What staging and production run: the app image by its commit SHA tag and its digest, with the release version as a
// comment. The digest is what Kubernetes pulls, so a tag pushed again (a rerun of the same commit) can't change what
// runs. The version names the release by its Toronto date and a counter (2026.11.20.1); the staging job tags the
// commit with it in git, so promote can take it.
//   node scripts/deploy-image.mjs version                              the next release version (SERVER_URL, REPOSITORY, TOKEN)
//   node scripts/deploy-image.mjs write <values> <sha> <digest> [ver]   sets the image block of a values file
//   node scripts/deploy-image.mjs resolve <input>                      for promote: prints "<sha> <digest> <version>" for an
//                                                                       empty input (staging's), a SHA or a version
//                                                                       (IMAGE, REG_USER, REGISTRY_TOKEN; git in the checkout)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const VERSION = /^\d{4}\.\d{2}\.\d{2}\.\d+$/;

/** The day in Toronto as YYYY.MM.DD. */
export function torontoDay(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return parts.replaceAll("-", ".");
}

/** The next version on `day`, one past the highest counter among the tags already on that day. */
export function nextVersion(day, tags) {
  const counters = tags.filter((t) => VERSION.test(t) && t.startsWith(`${day}.`)).map((t) => Number(t.slice(day.length + 1)));
  return `${day}.${Math.max(0, ...counters) + 1}`;
}

/** The next release version, from today's Toronto date and the repo's tags (every page). */
export async function releaseVersion({ env, now, fetchImpl = fetch }) {
  const names = [];
  for (let page = 1; ; page++) {
    const res = await fetchImpl(`${env.SERVER_URL}/api/v1/repos/${env.REPOSITORY}/tags?page=${page}&limit=50`, { headers: { Authorization: `token ${env.TOKEN}` } });
    if (!res.ok) throw new Error(`Reading the repo's tags failed: HTTP ${res.status}`);
    const batch = await res.json();
    names.push(...batch.map((t) => t.name));
    if (batch.length < 50) break;
  }
  return nextVersion(torontoDay(now), names);
}

/** The values file with its image tag set to `sha` (the version as a comment) and the digest on the next line. */
export function writeImage(text, { sha, digest, version = "" }) {
  if (!SHA.test(sha)) throw new Error(`Not a full commit sha: ${sha}`);
  if (!DIGEST.test(digest)) throw new Error(`Not an image digest: ${digest}`);
  if (version && !VERSION.test(version)) throw new Error(`Not a release version: ${version}`);
  const lines = text.split("\n");
  const image = lines.findIndex((l) => /^image:\s*$/.test(l));
  const tag = lines.findIndex((l, i) => i > image && /^\s+tag:/.test(l));
  if (image < 0 || tag < 0) throw new Error("The values file has no image tag line.");
  const indent = lines[tag].match(/^\s+/)[0];
  lines[tag] = `${indent}tag: "${sha}"${version ? `  # ${version}` : ""}`;
  const digestLine = `${indent}digest: "${digest}"`;
  if (/^\s+digest:/.test(lines[tag + 1] ?? "")) lines[tag + 1] = digestLine;
  else lines.splice(tag + 1, 0, digestLine);
  return lines.join("\n");
}

/** The image a values file runs: { sha, digest, version }, each empty when it isn't there. */
export function readImage(text) {
  const tag = text.match(/^\s+tag:\s*"?([0-9a-f]{40})?"?\s*(?:#\s*(\S+))?\s*$/m);
  const digest = text.match(/^\s+digest:\s*"?(sha256:[0-9a-f]{64})?"?\s*$/m);
  return { sha: tag?.[1] ?? "", digest: digest?.[1] ?? "", version: tag?.[2] ?? "" };
}

/** What promote was given: "empty", "sha" (7 to 40 lowercase hex) or "version". Anything else is refused. */
export function classify(input) {
  if (input.trim() === "") return "empty";
  if (/^[0-9a-f]{7,40}$/.test(input)) return "sha";
  if (VERSION.test(input)) return "version";
  throw new Error(`Not a version: give a commit sha (7 to 40 hex characters), a release version such as 2026.11.20.1, or nothing for what's on staging.`);
}

/** The digest the registry holds for `image:tag`. */
export async function digestFor({ image, tag, user, token, fetchImpl = fetch }) {
  const host = image.split("/")[0];
  const name = image.slice(host.length + 1);
  const basic = Buffer.from(`${user}:${token}`).toString("base64");
  const auth = await fetchImpl(`https://${host}/v2/token?service=container_registry&scope=repository:${name}:pull`, { headers: { Authorization: `Basic ${basic}` } });
  if (!auth.ok) throw new Error(`The registry refused a token: HTTP ${auth.status}`);
  const { token: bearer } = await auth.json();
  const res = await fetchImpl(`https://${host}/v2/${name}/manifests/${tag}`, {
    method: "HEAD",
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json",
    },
  });
  if (res.status === 404) throw new Error(`There's no image ${image}:${tag} in the registry (cleaned up?), so it can't be deployed.`);
  if (!res.ok) throw new Error(`Asking the registry for ${image}:${tag} failed: HTTP ${res.status}`);
  const digest = res.headers.get("docker-content-digest");
  if (!DIGEST.test(digest ?? "")) throw new Error(`The registry gave no digest for ${image}:${tag}.`);
  return digest;
}

/** The newest release version tagging `sha`, or "". */
function versionAt(git, sha) {
  const versions = git.tagsAt(sha).filter((t) => VERSION.test(t));
  versions.sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
  return versions[0] ?? "";
}

/**
 * What promote deploys for `input`: { sha, digest, version }. `git` has revParse(ref) (a full sha or null), tagsAt(sha)
 * and show(ref) (a file's text or null); `digestFor(tag)` asks the registry.
 */
export async function resolve(input, { git, digestFor: lookup }) {
  const kind = classify(input);
  if (kind === "empty") {
    const text = git.show("origin/staging:deploy/values-staging.yaml");
    if (text === null) throw new Error("There is no staging branch yet, so there is no staging version. Give a version, or run the release workflow on main so it creates it.");
    const { sha, digest, version } = readImage(text);
    if (!sha) throw new Error("Staging's values file names no commit.");
    return { sha, digest: digest || (await lookup(sha)), version: version || versionAt(git, sha) };
  }
  if (kind === "version") {
    const sha = git.revParse(`refs/tags/${input}`);
    if (!sha) throw new Error(`There's no release ${input}.`);
    return { sha, digest: await lookup(sha), version: input };
  }
  const sha = git.revParse(input);
  if (!sha) throw new Error(`${input} is not a commit in this repo.`);
  return { sha, digest: await lookup(sha), version: versionAt(git, sha) };
}

const run = (...args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};
const checkoutGit = {
  revParse: (ref) => run("rev-parse", "--verify", "--quiet", `${ref}^{commit}`)?.trim() || null,
  tagsAt: (sha) => (run("tag", "--points-at", sha) ?? "").split("\n").filter(Boolean),
  show: (ref) => run("show", ref),
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  const e = process.env;
  try {
    if (cmd === "version") {
      console.log(await releaseVersion({ env: e, now: new Date() }));
    } else if (cmd === "write") {
      const [file, sha, digest, version] = args;
      writeFileSync(file, writeImage(readFileSync(file, "utf8"), { sha, digest, version }));
    } else if (cmd === "resolve") {
      const lookup = (tag) => digestFor({ image: e.IMAGE, tag, user: e.REG_USER, token: e.REGISTRY_TOKEN });
      const r = await resolve(args[0] ?? "", { git: checkoutGit, digestFor: lookup });
      console.log(`${r.sha} ${r.digest} ${r.version}`.trimEnd());
    } else {
      throw new Error("Use: version | write <values> <sha> <digest> [version] | resolve <input>");
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
