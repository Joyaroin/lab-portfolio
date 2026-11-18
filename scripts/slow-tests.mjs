// Flags slow unit tests (#416). A unit sweep in src/pin.test.ts once ran close to vitest's 5000 ms default and timed out on the busy CI
// runner; nothing warned while it still passed. CI's frontend job runs this after `make frontend`, which writes vitest's JSON report;
// each test over SLOW_MS prints as a `::warning::` line, so it shows in the job's annotations. It warns and never fails: every problem
// (a missing or unreadable report) is logged and the process exits 0.
//   node scripts/slow-tests.mjs [report.json]    default report: test-results/vitest.json
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

export const SLOW_MS = 1000;
export const REPORT = "test-results/vitest.json";

// Workflow commands end at a line break, and % starts an escape: escape both so a test name can't cut or forge a line.
const escape = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

/** One `::warning::` line per test over `thresholdMs` in a vitest JSON report, slowest first. File paths are relative to `root`. */
export function slowTestLines(report, { root = process.cwd(), thresholdMs = SLOW_MS } = {}) {
  const slow = [];
  for (const file of report.testResults ?? []) {
    for (const t of file.assertionResults ?? []) {
      if (typeof t.duration === "number" && t.duration > thresholdMs) {
        slow.push({ file: relative(root, file.name), name: t.fullName ?? t.title, ms: Math.round(t.duration) });
      }
    }
  }
  return slow
    .sort((a, b) => b.ms - a.ms)
    .map((s) => `::warning::${escape(`${s.file}: ${s.name} took ${s.ms} ms (over ${thresholdMs} ms)`)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? REPORT;
  try {
    const lines = slowTestLines(JSON.parse(readFileSync(file, "utf8")));
    for (const l of lines) console.log(l);
    if (!lines.length) console.log(`slow tests: none over ${SLOW_MS} ms`);
  } catch (err) {
    console.log(`slow tests: could not read ${file}: ${err.message}`);
  }
}
