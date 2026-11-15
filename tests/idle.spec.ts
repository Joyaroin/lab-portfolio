import { test, expect, type Page } from "@playwright/test";
import { countDraws, goTo, draws, frames } from "./lib/page";

test.setTimeout(60_000); // several idle waits

// Wait out the power-on (about 1.5 s) and the camera's glide, with a margin.
const SETTLE_SLEEP_MS = 8_000;

async function bootDone(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await expect(page.locator("[data-meter-bar]")).toBeVisible();
}
async function powerOnSettled(page: Page) {
  await bootDone(page);
  await page.waitForTimeout(SETTLE_SLEEP_MS);
}

// The ambient screens on the spare CRTs (ADR 0007) redraw about 12 times a second at the landscape overview, so
// that is the one place the room never goes idle. Everywhere else they hold a still frame: at a station, in
// portrait framing and under reduced motion, and at rest then nothing draws.
const PHONE = { width: 390, height: 844 };

test.describe("at rest the 3D scene draws no frames", () => {
  async function expectIdle(page: Page) {
    expect(await draws(page)).toBeGreaterThan(0); // the power-on did draw
    const before = await draws(page);
    await page.waitForTimeout(5_000);
    expect(await draws(page)).toBe(before);
  }
  test("at a station", async ({ page }) => {
    await countDraws(page);
    await bootDone(page);
    await goTo(page, 1);
    await page.waitForTimeout(SETTLE_SLEEP_MS);
    await expectIdle(page);
  });
  test.describe("in portrait framing", () => {
    test.use({ viewport: PHONE });
    test("at the overview", async ({ page }) => {
      await countDraws(page);
      await powerOnSettled(page);
      await expectIdle(page);
    });
  });
  test.describe("under reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("at the overview", async ({ page }) => {
      await countDraws(page);
      await powerOnSettled(page);
      await expectIdle(page);
    });
  });
});

test("at the landscape overview the ambient screens keep drawing", async ({ page }) => {
  await countDraws(page);
  await powerOnSettled(page);
  const before = await draws(page);
  await expect.poll(() => draws(page), { intervals: [500] }).toBeGreaterThan(before + 3);
});

test.describe("in portrait framing", () => {
  test.use({ viewport: PHONE });
  test("pointer movement still draws, and then it goes idle again", async ({ page }) => {
    await countDraws(page);
    await powerOnSettled(page);
    const before = await draws(page);
    await page.mouse.move(100, 100);
    await page.mouse.move(300, 300, { steps: 5 });
    await expect.poll(() => draws(page)).toBeGreaterThan(before);
    await page.waitForTimeout(SETTLE_SLEEP_MS); // the parallax has eased
    const settled = await draws(page);
    await page.waitForTimeout(3_000);
    expect(await draws(page)).toBe(settled);
  });
});

test("a flight between stations still draws, and then it goes idle again", async ({ page }) => {
  await countDraws(page);
  await bootDone(page);
  await goTo(page, 1);
  await page.waitForTimeout(SETTLE_SLEEP_MS);
  let before = await draws(page);
  await goTo(page, 2);
  await expect.poll(() => draws(page)).toBeGreaterThan(before);

  await page.waitForTimeout(SETTLE_SLEEP_MS); // the camera has arrived
  before = await draws(page);
  await page.waitForTimeout(3_000);
  expect(await draws(page)).toBe(before);
});

// After the room starts, the only thing left to draw is the power-on:
// a frame after frame for about a second and a half, then nothing. Counting frames (not draw
// calls) tells that from the one or two frames the room draws when it appears. It runs at a portrait
// size, where the ambient screens hold a still frame: at the landscape overview they never stop.
test.describe("the power-on", () => {
  test.use({ viewport: PHONE });
  test("draws frame after frame, then stops", { tag: "@timing" }, async ({ page }) => {
    await countDraws(page);
    await bootDone(page);
    await page.waitForTimeout(3_000);
    const settled = await frames(page);
    expect(settled).toBeGreaterThan(POWER_ON_MIN_FRAMES);
    await page.waitForTimeout(2_000);
    expect(await frames(page)).toBe(settled);
  });
});
// Measured on the agents' old VM: 4 frames without the power-on, 17 with it. CI's slower rendering still
// is expected to manage the power-on's 1.4 s in about 7 (an estimate, not measured on the runner), so 5 should separate the two.
const POWER_ON_MIN_FRAMES = 5;

// The screens' pixels, not only the frame count: a screen redrawn into its texture without a frame being
// asked for would not show in the count. The page is a screenshot of everything on it, so it also catches
// anything else that moves. The first test shows the comparison can see the screens move at all.
test.describe("the ambient screens' pixels", () => {
  const twoSeconds = async (page: Page) => {
    const first = await page.screenshot();
    await page.waitForTimeout(2_000);
    return { first, second: await page.screenshot() };
  };
  test("change over two seconds at the landscape overview", { tag: "@timing" }, async ({ page }) => {
    await powerOnSettled(page);
    const { first, second } = await twoSeconds(page);
    expect(second.equals(first)).toBe(false);
  });
  test("do not change over two seconds at a station", { tag: "@timing" }, async ({ page }) => {
    await countDraws(page);
    await bootDone(page);
    await goTo(page, 1);
    await page.waitForTimeout(SETTLE_SLEEP_MS);
    const before = await frames(page);
    const { first, second } = await twoSeconds(page);
    expect(second.equals(first)).toBe(true);
    expect(await frames(page)).toBe(before);
  });
  test.describe("under reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("do not change over two seconds at the overview", { tag: "@timing" }, async ({ page }) => {
      await countDraws(page);
      await powerOnSettled(page);
      const before = await frames(page);
      const { first, second } = await twoSeconds(page);
      expect(second.equals(first)).toBe(true);
      expect(await frames(page)).toBe(before);
    });
  });
});

test("at rest the title cards show on the TVs", async ({ page }) => {
  await powerOnSettled(page);
  await page.screenshot({ path: "test-results/idle-rest.png" });
});
