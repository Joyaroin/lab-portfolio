import { test, expect } from "@playwright/test";
import { landedAt, openTour, readCamera, waitForCamera, waitUntilStill } from "./lib/page";

// waitUntilStill must wait for things that settle slowly, and must still fail for things that never settle.

test("waits through a slow settle and returns where it stopped", async () => {
  let n = 0;
  const got = await waitUntilStill(async () => Math.min(n++, 6), 50);
  expect(got).toBe(6);
});

test("fails, at its timeout, when the value never stops changing", { tag: "@timing" }, async () => {
  let n = 0;
  const t0 = Date.now();
  await expect(waitUntilStill(async () => n++, 50, 1_000)).rejects.toThrow();
  expect(Date.now() - t0).toBeGreaterThan(900);
});

test("a test left at the default 30 s limit fails with the last values read, not a plain timeout", { tag: "@timing" }, async () => {
  test.setTimeout(8_000); // stands in for the 30 s default: shorter than STILL_LIMIT_MS
  let n = 0;
  const t0 = Date.now();
  const err = await waitUntilStill(async () => ({ n: n++ }), 50).then(() => null, (e: Error) => e);
  expect(err, "it failed").not.toBeNull();
  expect(Date.now() - t0, "before the test's own timeout").toBeLessThan(8_000);
  const plain = err!.message.replace(/\u001b\[\d+m/g, ""); // Playwright colours the diff
  expect(plain).toMatch(/still moving, last read \{.*n.*:\d+\}/);
});

// The scene draws on demand and writes data-camera per drawn frame. When frames come further apart than the poll, two plain
// reads match while the camera still has an ease ahead of it (#330: the wheel spec read it before it had come to rest).
test("waitForCamera does not return before slow frames have eased the camera to rest", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript((gap) => { // every frame comes `gap` ms late, more than the poll's 300 ms
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => raf(() => { setTimeout(() => raf(cb), gap); })) as typeof requestAnimationFrame;
  }, 450);
  await openTour(page);
  await landedAt(page, 0);
  await waitForCamera(page);
  await page.mouse.move(640, 400); // starts the parallax easing
  const camera = await waitForCamera(page);
  await page.waitForTimeout(6_000); // however slow the frames, this is long enough for the ease to finish
  expect(await readCamera(page), "the camera had come to rest").toEqual(camera);
});
