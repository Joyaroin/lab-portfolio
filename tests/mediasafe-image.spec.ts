import { test, expect, type Page } from "@playwright/test";
import { goTo, openTour, panelOf, waitForPanel, stationIds } from "./lib/page";
import { stations } from "../src/content";

// #341: the MediaSafe page's Library screenshot. It is fetched only once that page is shown, sits at the right of the panel's top row with the
// heading, lead and stat line in the column to its left, goes after the bullets in portrait and is left out on a short landscape window.
// The build gives the file a hashed name (mediasafe-library-<hash>.jpg), so the requests are matched on the name's start.
const PROJECTS = stationIds.indexOf("projects") + 1;
const isShot = (url: string) => /\/mediasafe-library[^/]*\.jpg(\?|$)/.test(url);
const shotRequests = (page: Page) => {
  const urls: string[] = [];
  page.on("request", (r) => { if (isShot(r.url())) urls.push(r.url()); });
  return urls;
};
const shotWords = stations.find((s) => s.id === "projects")!.pages.find((p) => p.id === "mediasafe")!.image!;
const panel = (page: Page) => panelOf(page, "projects");
const img = (page: Page) => panel(page).getByRole("img", { name: shotWords.alt });
/** Opens the MediaSafe page as a visitor does: the Projects monitor, then its list row. */
async function openMediaSafe(page: Page) {
  await openTour(page);
  await goTo(page, PROJECTS);
  await panel(page).locator('[data-row="mediasafe"]').click();
  await waitForPanel(page, "projects");
}
const loaded = (page: Page) => expect.poll(() => img(page).evaluate((i: HTMLImageElement) => i.complete && i.naturalHeight)).toBeGreaterThan(0);

test("no request for the screenshot at boot, on another station or on another Projects page; one once MediaSafe is shown", async ({ page }) => {
  const urls = shotRequests(page);
  await page.goto("/");
  await openTour(page);
  expect(urls).toEqual([]);
  expect(await page.locator(`img[src*="mediasafe-library"]`).count()).toBe(0);
  await goTo(page, 1);
  expect(urls).toEqual([]);
  // the Projects list and its other pages don't fetch it either
  await goTo(page, PROJECTS);
  await expect(panel(page).locator("[data-list]")).toBeVisible();
  await panel(page).locator('[data-row="software-factory"]').click();
  await expect(panel(page).locator("[data-stat]")).toBeVisible();
  expect(urls).toEqual([]);
  await panel(page).getByRole("link", { name: "~/projects", exact: true }).click();
  await panel(page).locator('[data-row="mediasafe"]').click();
  await expect(img(page)).toBeVisible();
  await loaded(page);
  expect(urls.length).toBeGreaterThan(0);
  expect(await img(page).getAttribute("alt")).toBe("MediaSafe's Library page, showing three of the shows Adham tracks.");
});

test("the image's box has the file's own shape, so nothing shifts when it loads", async ({ page }) => {
  await openMediaSafe(page);
  await loaded(page);
  const { w, h, nw, nh } = await img(page).evaluate((i: HTMLImageElement) => ({ w: i.width, h: i.height, nw: i.naturalWidth, nh: i.naturalHeight }));
  const attrs = await img(page).evaluate((i) => [i.getAttribute("width"), i.getAttribute("height")]);
  expect(attrs).toEqual([String(nw), String(nh)]);
  expect(Math.abs(w / h - nw / nh), "drawn at the file's aspect ratio").toBeLessThan(0.02);
});

test("at 1280x720 the heading, lead and stat are in the column left of the image, at the right of the top row", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openMediaSafe(page);
  await expect(img(page)).toBeVisible();
  await loaded(page);
  const p = panel(page);
  const photo = (await img(page).boundingBox())!;
  const box = async (sel: string) => (await p.locator(sel).boundingBox())!;
  const panelBox = (await p.boundingBox())!;
  for (const sel of ["[data-heading]", "[data-lead]", "[data-stat]"]) {
    const b = await box(sel);
    expect(b.x + b.width, `${sel} ends left of the image`).toBeLessThanOrEqual(photo.x + 1);
  }
  expect((await box("[data-lead]")).y, "the lead is below the heading, in the same column").toBeGreaterThan((await box("[data-heading]")).y);
  expect(photo.x + photo.width, "the image is at the right of the panel").toBeGreaterThan(panelBox.x + panelBox.width - 40);
  expect(photo.y, "level with the heading, at the top of the panel").toBeLessThan((await box("[data-heading]")).y + 40);
  const em = await p.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(photo.width, "9.5em wide").toBeCloseTo(9.5 * em, 0);
});

test("at 390x844 the image comes after the bullets, in the page's order", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMediaSafe(page);
  await expect(img(page)).toBeVisible();
  await loaded(page);
  const p = panel(page);
  const photo = (await img(page).boundingBox())!;
  const lastBullet = (await p.locator("ul:not([data-list] ul) > li").last().boundingBox())!;
  const stat = (await p.locator("[data-stat]").boundingBox())!;
  expect(photo.y, "after the last bullet").toBeGreaterThanOrEqual(lastBullet.y + lastBullet.height - 1);
  expect(photo.y, "after the stat line, so it pushes no text down").toBeGreaterThan(stat.y + stat.height);
  // the heading is the first thing in the panel's text, as on any project page
  const heading = (await p.locator("[data-heading]").boundingBox())!;
  expect(heading.y).toBeLessThan(stat.y);
});

test("on a short landscape phone (667x375) the screenshot is not shown, nor fetched", async ({ page }) => {
  const urls = shotRequests(page);
  await page.setViewportSize({ width: 667, height: 375 });
  await openMediaSafe(page);
  await expect(panel(page).locator("[data-heading]")).toBeVisible();
  await expect(img(page)).toHaveCount(0);
  await expect(panel(page).locator("[data-photo]")).toHaveCount(0);
  expect(urls).toEqual([]);
});

test("a screenshot whose file fails to load shows nothing, and the lead and stat still show", async ({ page }) => {
  let asked = 0;
  await page.route((u) => isShot(u.href), (r) => { asked++; return r.fulfill({ status: 404 }); });
  await openMediaSafe(page);
  await expect.poll(() => asked).toBeGreaterThan(0);
  await expect(panel(page).locator("[data-photo]")).toHaveCount(0);
  await expect(img(page)).toHaveCount(0); // (the diagram is an img too, so this one is looked for by its name)
  await expect(panel(page).locator("[data-lead]")).toBeVisible();
  await expect(panel(page).locator("[data-stat]")).toBeVisible();
});
