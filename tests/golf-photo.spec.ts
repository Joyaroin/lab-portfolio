import { test, expect, type Page } from "@playwright/test";
import { goTo, openTour, panelOf, readDrawnCamera, waitForPanel, stationIds } from "./lib/page";
import { stations } from "../src/content";

// #342: Off the keyboard's golf day photo, below the bullets with its caption under it. It is fetched only once that page is shown, never
// opens larger, is after the bullets in portrait and is left out (caption too) on a short landscape window.
// The build gives the file a hashed name (golf-day-<hash>.jpg), so the requests are matched on the name's start.
const ABOUT = stationIds.indexOf("about") + 1;
const isGolf = (url: string) => /\/golf-day[^/]*\.jpg(\?|$)/.test(url);
const golfRequests = (page: Page) => {
  const urls: string[] = [];
  page.on("request", (r) => { if (isGolf(r.url())) urls.push(r.url()); });
  return urls;
};
const words = stations.find((s) => s.id === "about")!.pages.find((p) => p.id === "off-the-keyboard")!.image!;
const panel = (page: Page) => panelOf(page, "about");
const img = (page: Page) => panel(page).getByRole("img", { name: words.alt });
const caption = (page: Page) => panel(page).locator("[data-caption]");
/** Opens Off the keyboard as a visitor does: the About me monitor, then its tab. */
async function openOffTheKeyboard(page: Page) {
  await openTour(page);
  await goTo(page, ABOUT);
  await panel(page).locator('[data-tabs] [data-page="off-the-keyboard"]').click();
  await waitForPanel(page, "about");
}
const loaded = (page: Page) => expect.poll(() => img(page).evaluate((i: HTMLImageElement) => i.complete && i.naturalHeight)).toBeGreaterThan(0);

test("no request for the photo at boot, on another station or on About me's other pages; one once Off the keyboard is shown", async ({ page }) => {
  const urls = golfRequests(page);
  await page.goto("/");
  await openTour(page);
  expect(urls).toEqual([]);
  expect(await page.locator(`img[src*="golf-day"]`).count()).toBe(0);
  await goTo(page, 1);
  expect(urls).toEqual([]);
  // About me's first page and Contact don't fetch it either
  await goTo(page, ABOUT);
  await expect(panel(page).locator("[data-lead]")).toBeVisible();
  await panel(page).locator('[data-tabs] [data-page="contact"]').click();
  await expect(panel(page).locator("[data-page=contact][aria-current=page]")).toBeVisible();
  expect(urls).toEqual([]);
  await panel(page).locator('[data-tabs] [data-page="off-the-keyboard"]').click();
  await expect(img(page)).toBeVisible();
  await loaded(page);
  expect(urls.length).toBeGreaterThan(0);
});

test("the photo has its alt text, its caption is real text under it, and it opens no larger", async ({ page }) => {
  await openOffTheKeyboard(page);
  await expect(img(page)).toBeVisible();
  await loaded(page);
  expect(await img(page).getAttribute("alt")).toBe("Adham and his Solace teammates on a golf course.");
  await expect(caption(page)).toHaveText("Team golf day at Solace.");
  // under the image, centred on it
  const photo = (await img(page).boundingBox())!;
  const cap = (await caption(page).boundingBox())!;
  expect(cap.y, "the caption is under the image").toBeGreaterThanOrEqual(photo.y + photo.height - 1);
  const text = await caption(page).evaluate((c) => { const r = document.createRange(); r.selectNodeContents(c); const b = r.getBoundingClientRect(); return { x: b.x, w: b.width }; });
  expect(Math.abs(text.x + text.w / 2 - (photo.x + photo.width / 2)), "the caption's text is centred under the image").toBeLessThan(3);
  // no button around it and no dialog: it does not open larger
  expect(await panel(page).locator("[data-below] button, [data-below] a").count()).toBe(0);
  await img(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the image's box has the file's own shape, so nothing shifts when it loads", async ({ page }) => {
  await openOffTheKeyboard(page);
  await loaded(page);
  const { w, h, nw, nh } = await img(page).evaluate((i: HTMLImageElement) => ({ w: i.width, h: i.height, nw: i.naturalWidth, nh: i.naturalHeight }));
  expect(await img(page).evaluate((i) => [i.getAttribute("width"), i.getAttribute("height")])).toEqual([String(nw), String(nh)]);
  expect(Math.abs(w / h - nw / nh), "drawn at the file's aspect ratio").toBeLessThan(0.02);
});

test("it sits after the bullets, at 1280x720 and in portrait (390x844)", async ({ page }) => {
  for (const [width, height] of [[1280, 720], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    if (width === 1280) await openOffTheKeyboard(page);
    await expect(img(page)).toBeVisible();
    await loaded(page);
    await waitForPanel(page, "about");
    const photo = (await img(page).boundingBox())!;
    const lastBullet = (await panel(page).locator("ul > li").last().boundingBox())!;
    expect(photo.y, `after the last bullet at ${width}x${height}`).toBeGreaterThanOrEqual(lastBullet.y + lastBullet.height - 1);
  }
});

test("on a short landscape phone (667x375) the photo and its caption are not shown, nor fetched", async ({ page }) => {
  const urls = golfRequests(page);
  await page.setViewportSize({ width: 667, height: 375 });
  await openOffTheKeyboard(page);
  await expect(panel(page).locator("[data-heading]")).toBeVisible();
  await expect(img(page)).toHaveCount(0);
  await expect(caption(page)).toHaveCount(0);
  expect(urls).toEqual([]);
});

test("a photo whose file fails to load shows nothing, caption included, and the bullets still show", async ({ page }) => {
  let asked = 0;
  await page.route((u) => isGolf(u.href), (r) => { asked++; return r.fulfill({ status: 404 }); });
  await openOffTheKeyboard(page);
  await expect.poll(() => asked).toBeGreaterThan(0);
  await expect(img(page)).toHaveCount(0);
  await expect(panel(page).locator("[data-below]")).toHaveCount(0);
  await expect(caption(page)).toHaveCount(0);
  await expect(panel(page).getByText("Tennis. Most weeks", { exact: false })).toBeVisible();
});

test("the cue follows the photo: with lines added until the page overflows only because of the photo, the cue shows, and it goes when the file fails to load", async ({ page }) => {
  // The file is held back, then refused. While it is held the photo is mounted with the file's shape already.
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route((u) => isGolf(u.href), async (r) => { await gate; await r.fulfill({ status: 404 }); });
  await openOffTheKeyboard(page);
  await expect(panel(page).locator("[data-below]")).toHaveCount(1);
  // add lines under the bullets until the page is just past the panel's edge: the photo is several lines tall, so without it the page would fit
  await panel(page).evaluate((p) => {
    const last = p.querySelector("ul:not([data-list] ul)")!.lastElementChild!;
    while (p.scrollHeight - p.clientHeight <= 6) {
      const line = last.cloneNode(false) as HTMLElement;
      line.textContent = "A line the test added.";
      last.parentElement!.append(line);
    }
  });
  await readDrawnCamera(page); // the cue is worked out on a frame the room draws
  await expect(panel(page)).toHaveAttribute("data-more", "true");
  release();
  await expect(panel(page).locator("[data-below]")).toHaveCount(0);
  // worked out again when the photo goes, with no scroll, no page change and no frame asked for in between
  await expect(panel(page)).not.toHaveAttribute("data-more", "true");
});
