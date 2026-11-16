import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Agents share the Mac, so each gets its own port in $TEST_PORT. CI leaves it unset.
const port = Number(process.env.TEST_PORT) || 4173;
const origin = `http://127.0.0.1:${port}`;

// CI draws WebGL on Mesa's llvmpipe (LAB_WEBGL=llvmpipe, set in ci.yml and release.yml, run under Xvfb): a third of SwiftShader's CPU at the
// same frame rate. It needs the full Chromium, because the headless shell has no display for OpenGL, and ANGLE on GL.
// Anywhere else Playwright's default stands.
const llvmpipe = process.env.LAB_WEBGL === "llvmpipe"
  ? { channel: "chromium", launchOptions: { args: ["--use-angle=gl", "--ignore-gpu-blocklist", "--enable-gpu"] } }
  : {};

export default defineConfig({
  // Where TEST_PORT is set (agent sessions on the Mac) one worker, so one session can't take the CPU from the others.
  // CI: 3, because the runner draws WebGL on its CPUs and runs 2 jobs at once (release runs 526 and 527 overlapped and took 859 s
  // and 795 s, against about 450 s alone); Playwright's default (half the CPUs, 6) overloaded it and timing specs missed frames.
  // A Mac without TEST_PORT keeps the default.
  workers: process.env.TEST_PORT ? 1 : process.env.CI ? 3 : undefined,
  testDir: "tests",
  testMatch: "*.spec.ts",
  webServer: {
    command: `npm run build && npm run preview -- --port ${port}`,
    // The repo root, so the tests run the same from any working directory.
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    url: origin,
    reuseExistingServer: false,
  },
  use: { baseURL: origin, ...llvmpipe },
  // Two projects, so each test runs once, in one of them. CI retries a failed test once, except @timing: a timing
  // test is a limit check and fails on its first failure. Outside CI nothing retries. A project's grep combines with
  // the CLI's --grep, so make browser-light and the like select the same tests as before.
  projects: [
    { name: "timing", grep: /@timing/, retries: 0 },
    { name: "browser", grepInvert: /@timing/, retries: process.env.CI ? 1 : 0 },
  ],
  // The meter and HUD only appear once the room is ready. WebGL draws on the CPU, in CI and on the
  // agents' Mac, which takes a few seconds, so the timeout stays generous.
  expect: { timeout: 15_000 },
});
