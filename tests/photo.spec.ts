import { test, expect, type Page } from "@playwright/test";
import { goTo, openTour, panelOf, waitForPanel, stationIds } from "./lib/page";
import { stations } from "../src/content";

// #287: the photo on About me's first page. It is fetched only when that page is shown, never at boot.
// The build gives the file a hashed name (adham-<hash>.jpg), so the requests are matched on the name's start.
const ABOUT = stationIds.indexOf("about") + 1;
const isPhoto = (url: string) => /\/adham[^/]*\.jpg(\?|$)/.test(url);
const photoRequests = (page: Page) => {
  const urls: string[] = [];
  page.on("request", (r) => { if (isPhoto(r.url())) urls.push(r.url()); });
  return urls;
};
// the portrait is About me's first page's image (#340); its words are in the content module
const portrait = stations.find((s) => s.id === "about")!.pages[0].image!;
const img = (page: Page) => panelOf(page, "about").getByRole("img", { name: portrait.alt });

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
  expect(await img(page).getAttribute("alt")).toBe(portrait.alt);
  expect(portrait.alt).toBe("Adham Sedik, smiling, in glasses and a black polo");
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

test("on a short landscape phone (667x375) the photo is not shown, nor fetched, on About's first page", async ({ page }) => {
  const urls = photoRequests(page);
  await page.setViewportSize({ width: 667, height: 375 });
  await openTour(page);
  await goTo(page, ABOUT);
  await waitForPanel(page, "about");
  await expect(panelOf(page, "about").locator("[data-heading]")).toBeVisible();
  await expect(img(page)).toHaveCount(0);
  await expect(panelOf(page, "about").locator("[data-photo]")).toHaveCount(0);
  expect(urls).toEqual([]);
});

// #340: a file that fails to load shows nothing, and the "more" cue follows the image. The room draws only on demand, so an image that
// arrives or fails after its page is shown changes the panel's height with nothing else to work the cue out again.
const photoUrl = (u: URL) => isPhoto(u.href);
/** A response the test releases by hand, so the image arrives at a moment it chooses and not after a timer. */
const gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((res) => (open = res));
  return { opened, open };
};
/** What the cue should say for the panel as it is: the same sum markMore does (src/text/more.ts), read from the browser. */
const cueShould = (page: Page) => panelOf(page, "about").evaluate((e) => String(e.scrollHeight - e.clientHeight - e.scrollTop > 4));
// A window short enough that About's first page runs past its panel with the portrait beside the heading, but not without it.
const CUE_HEIGHT = 670;

test("a portrait whose file fails to load shows nothing: no image and no empty frame", async ({ page }) => {
  let asked = 0;
  await page.route(photoUrl, (r) => { asked++; return r.fulfill({ status: 404 }); });
  await openTour(page);
  await goTo(page, ABOUT);
  await expect.poll(() => asked).toBeGreaterThan(0);
  const panel = panelOf(page, "about");
  await expect(panel.locator("[data-photo]")).toHaveCount(0);
  await expect(panel.getByRole("img")).toHaveCount(0);
  // the row that held the photo has only the heading's column left
  await expect(panel.locator(".crt-top > *")).toHaveCount(1);
  await expect(panel.locator("[data-heading]")).toBeVisible();
});

test("the more cue goes when the portrait fails to load after its page is shown", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: CUE_HEIGHT });
  const held = gate();
  await page.route(photoUrl, async (r) => { await held.opened; await r.fulfill({ status: 404 }); });
  await openTour(page);
  await goTo(page, ABOUT);
  await waitForPanel(page, "about");
  const panel = panelOf(page, "about");
  // the photo's box is held open by its size attributes while it loads, so the page runs past the panel and the cue is up
  await expect(panel.locator("[data-photo]")).toBeVisible();
  await expect(panel).toHaveAttribute("data-more", "true");
  held.open();
  await expect(panel.locator("[data-photo]")).toHaveCount(0);
  await expect(panel).toHaveAttribute("data-more", "false");
  expect(await cueShould(page)).toBe("false");
});

test("the more cue is worked out again when the portrait arrives and changes the panel's height", async ({ page }) => {
  const held = gate();
  // a taller picture than the box the page held for it (the size attributes say 480x600), so its arrival makes the page longer
  const tall = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="2400" viewBox="0 0 480 2400"><rect width="480" height="2400" fill="#888"/></svg>`;
  await page.route(photoUrl, async (r) => { await held.opened; await r.fulfill({ status: 200, contentType: "image/svg+xml", body: tall }); });
  await openTour(page);
  await goTo(page, ABOUT);
  await waitForPanel(page, "about");
  const panel = panelOf(page, "about");
  await expect(panel.locator("[data-photo]")).toBeVisible();
  await expect(panel).toHaveAttribute("data-more", "false");
  held.open();
  await expect.poll(() => img(page).evaluate((i: HTMLImageElement) => i.complete && i.naturalHeight)).toBeGreaterThan(0);
  await expect(panel).toHaveAttribute("data-more", "true");
  expect(await cueShould(page)).toBe("true");
});

test("a portrait that arrives late, as the file it is, leaves the cue right for the panel", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: CUE_HEIGHT });
  const held = gate();
  await page.route(photoUrl, async (r) => { await held.opened; await r.continue(); });
  await openTour(page);
  await goTo(page, ABOUT);
  await waitForPanel(page, "about");
  held.open();
  await expect.poll(() => img(page).evaluate((i: HTMLImageElement) => i.complete && i.naturalHeight)).toBeGreaterThan(0);
  const panel = panelOf(page, "about");
  await expect(panel).toHaveAttribute("data-more", await cueShould(page));
  await expect(panel).toHaveAttribute("data-more", "true");
});
