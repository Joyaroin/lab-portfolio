import { test, expect } from "@playwright/test";
import { stations, ui } from "../src/content";
import { PHONE_MENU_H } from "../src/pin";
import { goTo, hudLink, landedAt, openTour, stationIds, waitForPanel } from "./lib/page";

// The phone bar and the Start button (#177, #285). The Start button's second line depends on the window's shape; the bottom
// bar, one row of four buttons, is for a portrait window only.
const start = (page: import("@playwright/test").Page) => page.locator("[data-start]");
const startButton = (page: import("@playwright/test").Page) => start(page).getByRole("button", { name: `${ui.hud.start} ${ui.hud.startCount}` });

test.describe("phone touch", () => {
test.use({ hasTouch: true });
test("on a phone the links are one row of four bottom buttons at least 44 px tall, clear of the meter bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTour(page);
  const meter = (await page.locator("[data-meter-bar]").boundingBox())!;
  await expect(page.locator("[data-menu] a")).toHaveText([ui.room, ...stations.map((s) => s.name)]);
  for (let i = 0; i <= stationIds.length; i++) {
    const b = (await hudLink(page, i).boundingBox())!;
    expect(b.height, `link ${i} height`).toBeGreaterThanOrEqual(44);
    expect(b.y, `link ${i} is along the bottom`).toBeGreaterThan(844 / 2);
    expect(b.y + b.height, `link ${i} is on screen`).toBeLessThanOrEqual(844);
    expect(b.y >= meter.y + meter.height || b.y + b.height <= meter.y, `link ${i} clear of the meter bar`).toBe(true);
  }
  // One row: all four buttons on the same line.
  const ys: number[] = [];
  for (let i = 0; i <= stationIds.length; i++) ys.push(Math.round((await hudLink(page, i).boundingBox())!.y));
  expect(new Set(ys).size, "one row").toBe(1);
  const menu = (await page.locator("[data-menu]").boundingBox())!;
  expect(menu.height, "the bar is PHONE_MENU_H tall").toBeCloseTo(PHONE_MENU_H, 0);
});

test("a tap on each phone button lands at its place: Overview, Work, Projects, About me", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTour(page);
  for (const stop of [3, 1, 2, 0, 2]) {
    await hudLink(page, stop).tap();
    await landedAt(page, stop);
    if (stop) await expect(page.locator(`[data-screen="${stationIds[stop - 1]}"]`)).toBeVisible();
  }
});

test("a tap on the Start button starts the tour at Work", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTour(page);
  await startButton(page).tap();
  await landedAt(page, 1);
  await expect(start(page)).toHaveCount(0);
});
});

test("on a landscape window the links stay in the corner HUD, not 44 px buttons", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTour(page);
  expect((await hudLink(page, 1).boundingBox())!.y).toBeLessThan(100);
});

test("the Start button says or click a monitor on landscape and shows until the first landing, even back at the overview", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTour(page);
  await expect(startButton(page)).toBeVisible();
  await expect(start(page)).toContainText(ui.hud.startOrLandscape);
  await goTo(page, 1); // the landing, not the click
  await expect(start(page)).toBeHidden();
  await goTo(page, 0);
  await expect(start(page)).toBeHidden();
});

test("the Start button says or pick one below on portrait, and is gone after the first landing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTour(page);
  await expect(start(page)).toContainText(ui.hud.startOrPortrait);
  await expect(startButton(page)).toBeVisible();
  await goTo(page, 2);
  await expect(start(page)).toBeHidden();
  await goTo(page, 0);
  await expect(start(page)).toBeHidden();
});

// The meter bar stands above the phone bar, so the station text must end above the bar at every station.
for (const [w, h] of [[390, 844], [360, 740]]) {
  test(`portrait ${w}x${h}: the station text ends above the meter bar at every station`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: w, height: h });
    await openTour(page);
    for (const [k, id] of stationIds.entries()) {
      await goTo(page, k + 1);
      const panel = await waitForPanel(page, id);
      const bar = (await page.locator("[data-meter-bar]").boundingBox())!;
      expect(panel.top + panel.height, `${id} ends above the meter bar (${bar.y})`).toBeLessThanOrEqual(bar.y);
    }
  });
}
