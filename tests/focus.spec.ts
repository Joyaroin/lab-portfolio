import { test, expect, type Locator, type Page } from "@playwright/test";
import { barKey, hudLink, landedAt, openTour, panelOf, stationIds } from "./lib/page";
import { backButton, heading, nextButton, openStation, row, tab } from "./lib/pages";

// The site's focus ring (#219): a 2 px solid amber outline on every link and button under keyboard
// focus, and the boot screen's progress bar in the site's green.
const RING = "2px solid rgb(255, 179, 71)";

const outline = (el: Locator) =>
  el.evaluate((e) => { const s = getComputedStyle(e); return `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`; });

/** Presses Tab until `el` has focus, as a keyboard visitor reaches it. */
async function tabTo(page: Page, el: Locator) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (await el.evaluate((e) => e === document.activeElement)) return;
  }
  throw new Error("Tab never reached the element");
}

test("a HUD link reached with Tab has the ring", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTour(page);
  const link = hudLink(page, 2);
  await tabTo(page, link);
  expect(await outline(link)).toBe(RING);
});

test("a phone menu button reached with Tab has the ring", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTour(page);
  const button = hudLink(page, 3);
  await tabTo(page, button);
  expect(await outline(button)).toBe(RING);
});

test("a link in a station's panel reached with Tab has the ring", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTour(page);
  await hudLink(page, 1).click();
  await landedAt(page, 1);
  const panel = panelOf(page, stationIds[0]);
  await expect(panel).toBeFocused();
  const link = panel.getByRole("link").first();
  await tabTo(page, link);
  expect(await outline(link)).toBe(RING);
});

test("a meter bar key reached with Tab has the ring", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTour(page);
  const key = barKey(page, "start");
  await tabTo(page, key);
  expect(await outline(key)).toBe(RING);
});

test("a station's panel has no outline after a click on its HUD link, and the ring after Enter on it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTour(page);
  const panel = panelOf(page, stationIds[0]);

  await hudLink(page, 1).click();
  await landedAt(page, 1);
  await expect(panel).toBeFocused();
  expect((await outline(panel)).split(" ")[1]).toBe("none");

  await hudLink(page, 0).click();
  await landedAt(page, 0);
  await expect(panel).not.toBeFocused();

  await tabTo(page, hudLink(page, 1));
  await page.keyboard.press("Enter");
  await landedAt(page, 1);
  await expect(panel).toBeFocused();
  expect(await outline(panel)).toBe(RING);
});

test("the boot screen's progress bar is drawn in the site's green", async ({ page }) => {
  // The room's code is accepted and never answered, so the boot screen stays up.
  await page.route("**/assets/Room-*.js", () => {});
  await page.goto("/");
  const bar = page.getByRole("progressbar", { name: "Load progress" });
  await expect(bar).toBeVisible();
  expect(await bar.evaluate((e) => getComputedStyle(e).accentColor)).toBe("rgb(125, 255, 176)");
  await page.screenshot({ path: "test-results/boot-progress.png" });
});

// #284: after a tab, a row or a Next or Back button, focus goes to the new page's heading (tabindex="-1"), so a screen reader
// says where it landed. The arrow keys walk the pages without moving focus.
const focusedIs = (page: Page, el: Locator) => expect.poll(() => el.evaluate((e) => e === document.activeElement)).toBe(true);

test("after a tab, focus moves to the new page's heading", async ({ page }) => {
  test.setTimeout(90_000);
  await openStation(page, 1, "work", { width: 1280, height: 800 });
  const h = heading(page, "work");
  expect(await h.getAttribute("tabindex")).toBe("-1");
  await tab(page, "work", "barracuda").click();
  await expect(tab(page, "work", "barracuda")).toHaveAttribute("aria-current", "page");
  await focusedIs(page, h);
  await tab(page, "work", "solace").focus();
  await page.keyboard.press("Enter"); // from the keyboard too
  await expect(tab(page, "work", "solace")).toHaveAttribute("aria-current", "page");
  await focusedIs(page, h);
});

test("after a list row, the breadcrumb's link and the Next and Back buttons, focus moves to the new page's heading", async ({ page }) => {
  test.setTimeout(90_000);
  await openStation(page, 2, "projects", { width: 1280, height: 800 });
  const h = heading(page, "projects");
  await row(page, "projects", "mediasafe").click();
  await expect(h).toHaveText("MediaSafe");
  await focusedIs(page, h);
  await nextButton(page, "projects").click();
  await expect(h).toHaveText("Home lab");
  await focusedIs(page, h);
  await backButton(page, "projects").click();
  await expect(h).toHaveText("MediaSafe");
  await focusedIs(page, h);
  await panelOf(page, "projects").getByRole("link", { name: "~/projects" }).click();
  await expect(h).toHaveText("Things I've built and run");
  await focusedIs(page, h);
});

test("the arrow keys change the page without moving focus", async ({ page }) => {
  test.setTimeout(90_000);
  await openStation(page, 1, "work", { width: 1280, height: 800 });
  await expect(panelOf(page, "work")).toBeFocused(); // landing focuses the panel
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "work", "barracuda")).toHaveAttribute("aria-current", "page");
  await expect(panelOf(page, "work")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tab(page, "work", "solace")).toHaveAttribute("aria-current", "page");
  await expect(panelOf(page, "work")).toBeFocused();
  // and with a tab focused, → leaves focus on the tab
  await tab(page, "work", "solace").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "work", "barracuda")).toHaveAttribute("aria-current", "page");
  await focusedIs(page, tab(page, "work", "solace"));
});

test("a tab, a row and a button reached with Tab have the ring", async ({ page }) => {
  test.setTimeout(90_000);
  await openStation(page, 1, "work", { width: 1280, height: 800 });
  for (const el of [tab(page, "work", "barracuda"), nextButton(page, "work")]) {
    await tabTo(page, el);
    expect(await outline(el)).toBe(RING);
  }
});
