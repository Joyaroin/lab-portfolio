// The overview's frame cost (#378): the number #381-#384 repeat and post theirs against. The method is in docs/agents/testing.md
// ("Frame-cost baseline"); this is that method, so a number from here is comparable to the baseline.
//
//   npm run build && npm run preview -- --port $TEST_PORT      (one terminal; the site as built)
//   TEST_PORT=<port> heavy node scripts/frame-cost.mjs         (another: measure, 1 worker, through heavy)
//
// What it does: RUNS times, a fresh browser opens the site at 1280×720 (the landscape overview), waits for the boot
// screen to go and the meter bar to show, waits SETTLE_MS for the power-on and the camera to stop, then reads the browser's
// per-process CPU time (CDP SystemInfo.getProcessInfo: renderer, GPU and browser process) and the count of frames drawn
// (WebGL `clear` calls, one per frame, as tests/lib/page.ts counts), WINDOW_MS apart. Per run it prints frames per second,
// and the CPU milliseconds all processes spent per second of the window and per frame drawn. The result is the median over the runs.
import { chromium } from "@playwright/test";

const RUNS = 5, SETTLE_MS = 8_000, WINDOW_MS = 10_000, VIEWPORT = { width: 1280, height: 720 };
const port = Number(process.env.TEST_PORT) || 4173;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
for (let run = 1; run <= RUNS; run++) {
  // The same launch flag as playwright.config.ts: MediaSafe's host never resolves.
  const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP mediasafe.space ~NOTFOUND"] });
  const page = await (await browser.newContext({ viewport: VIEWPORT })).newPage();
  await page.addInitScript(() => {
    window.__frames = 0;
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const clear = C.prototype.clear;
      C.prototype.clear = function (mask) { window.__frames++; return clear.call(this, mask); };
    }
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByLabel("Boot log").waitFor({ state: "hidden" });
  await page.locator("[data-meter-bar]").waitFor();
  await sleep(SETTLE_MS);
  const cdp = await browser.newBrowserCDPSession();
  const cpu = async () => (await cdp.send("SystemInfo.getProcessInfo")).processInfo.reduce((n, p) => n + p.cpuTime, 0);
  const frames = () => page.evaluate(() => window.__frames);
  const [c0, f0] = [await cpu(), await frames()];
  await sleep(WINDOW_MS);
  const [c1, f1] = [await cpu(), await frames()];
  await browser.close();
  const seconds = WINDOW_MS / 1000, drawn = f1 - f0;
  const r = { fps: drawn / seconds, cpuMsPerSecond: ((c1 - c0) * 1000) / seconds, cpuMsPerFrame: drawn ? ((c1 - c0) * 1000) / drawn : NaN };
  results.push(r);
  console.log(`run ${run}: ${r.fps.toFixed(1)} frames/s, ${r.cpuMsPerSecond.toFixed(0)} CPU ms/s, ${r.cpuMsPerFrame.toFixed(1)} CPU ms/frame`);
}
console.log(`median of ${RUNS}: ${median(results.map((r) => r.fps)).toFixed(1)} frames/s, ${median(results.map((r) => r.cpuMsPerSecond)).toFixed(0)} CPU ms/s, ${median(results.map((r) => r.cpuMsPerFrame)).toFixed(1)} CPU ms/frame`);
