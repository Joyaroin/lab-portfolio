import { test, expect, type Page } from "@playwright/test";
import { goTo, openTour, panelOf, waitForPanel, stationIds } from "./lib/page";
import { ui } from "../src/content";

// #287: the photo on About me's first page. It is fetched only when that page is shown, never at boot.
// The build gives the file a hashed name (adham-<hash>.jpg), so the requests are matched on the name's start.
const ABOUT = stationIds.indexOf("about") + 1;
const isPhoto = (url: string) => /\/adham[^/]*\.jpg(\?|$)/.test(url);
const photoRequests = (page: Page) => {
  const urls: string[] = [];
  page.on("request", (r) => { if (isPhoto(r.url())) urls.push(r.url()); });
  return urls;
};
const img = (page: Page) => panelOf(page, "about").getByRole("img", { name: ui.photo.alt });

test("no request for the photo is made at boot", async ({ page }) => {
  const urls = photoRequests(page);
  await page.goto("/");
  await openTour(page);
  expect(urls).toEqual([]);
  // the markup the panels mount at boot has no <img> for it either
  expect(await page.locator(`img[src*="adham"]`).count()).toBe(0);
  // another station's page doesn't fetch it
  await goTo(page, 1);
  expect(urls).toEqual([]);
});

test("it loads on reaching About's first page, by clicking the HUD's About me link", async ({ page }) => {
  const urls = photoRequests(page);
  await openTour(page);
  expect(urls).toEqual([]);
  await goTo(page, ABOUT);
  await expect(img(page)).toBeVisible();
  // the browser has fetched and decoded it, not just mounted the tag
  await expect.poll(() => img(page).evaluate((i: HTMLImageElement) => i.complete && i.naturalHeight)).toBeGreaterThan(0);
  expect(urls.length).toBeGreaterThan(0);
  expect(await img(page).getAttribute("alt")).toBe("Adham Sedik, smiling, in glasses and a black polo");
});

test("it is on the first page only: Off the keyboard has none", async ({ page }) => {
  await openTour(page);
  await goTo(page, ABOUT);
  await expect(img(page)).toBeVisible();
  await panelOf(page, "about").getByRole("button", { name: "Off the keyboard", exact: true }).click();
  await expect(img(page)).toHaveCount(0);
});

test("at 1440x900 About's first page fits its panel with no scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTour(page);
  await goTo(page, ABOUT);
  await expect(img(page)).toBeVisible();
  await expect.poll(() => img(page).evaluate((i: HTMLImageElement) => i.complete && i.naturalHeight)).toBeGreaterThan(0);
  await waitForPanel(page, "about");
  const [scroll, client] = await panelOf(page, "about").evaluate((e) => [e.scrollHeight, e.clientHeight]);
  expect(scroll).toBeLessThanOrEqual(client);
});

test("the photo sits beside the heading on desktop and above it in portrait", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTour(page);
  await goTo(page, ABOUT);
  await expect(img(page)).toBeVisible();
  await waitForPanel(page, "about");
  const heading = panelOf(page, "about").locator("[data-heading]");
  const wide = { photo: (await img(page).boundingBox())!, heading: (await heading.boundingBox())! };
  expect(wide.photo.x, "right of the heading's start, beside it").toBeGreaterThan(wide.heading.x);
  expect(wide.photo.y, "level with the heading, not below it").toBeLessThan(wide.heading.y + wide.heading.height);

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForPanel(page, "about");
  await expect(img(page)).toBeVisible();
  const tall = { photo: (await img(page).boundingBox())!, heading: (await heading.boundingBox())! };
  expect(tall.photo.y + tall.photo.height, "the photo ends above the heading").toBeLessThanOrEqual(tall.heading.y + 1);
});
