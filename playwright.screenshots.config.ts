import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// The screenshots job's config: the same server and browser as playwright.config.ts, but it runs
// only shots/, so the browser job never takes screenshots and this job never runs the browser specs.
const port = Number(process.env.TEST_PORT) || 4173;
const origin = `http://127.0.0.1:${port}`;
// CI draws WebGL on Mesa's llvmpipe (LAB_WEBGL=llvmpipe, set in ci.yml, run under Xvfb): a third of SwiftShader's CPU at the
// same frame rate. It needs the full Chromium, because the headless shell has no display for OpenGL, and ANGLE on GL.
// Anywhere else Playwright's default stands.
const llvmpipe = process.env.LAB_WEBGL === "llvmpipe"
  ? { channel: "chromium", args: ["--use-angle=gl", "--ignore-gpu-blocklist", "--enable-gpu"] }
  : { args: [] as string[] };
// Like playwright.config.ts (#369): MediaSafe's host never resolves, so a screenshot never calls production MediaSafe, and Off the keyboard's
// screenshot shows the bullet alone, the same on every run, whatever Adham last watched.
const blockMediaSafe = "--host-resolver-rules=MAP mediasafe.space ~NOTFOUND";
const { args: llvmpipeArgs, ...llvmpipeUse } = llvmpipe;

export default defineConfig({
  testDir: "shots",
  testMatch: "*.spec.ts",
  workers: 1,
  retries: 0, // a screenshot that can't be taken fails the job
  webServer: {
    command: `npm run build && npm run preview -- --port ${port}`,
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    url: origin,
    reuseExistingServer: false,
  },
  use: { baseURL: origin, ...llvmpipeUse, launchOptions: { args: [blockMediaSafe, ...llvmpipeArgs] } },
  expect: { timeout: 15_000 },
});
