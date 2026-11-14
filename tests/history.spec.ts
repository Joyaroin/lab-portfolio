import { test, expect, type Page } from "@playwright/test";
import { clickLink, hudLink, landedAt, openTour, panelOf, readCamera, stationIds, waitForCamera } from "./lib/page";

// Monitor links and browser history (#175): each monitor has an address, the browser's back and forward move the
// visit, a direct link lands with no flight and an overview entry under it, and focus follows the visitor. Pages (#283):
// a page move replaces the entry, an old link lands in its new place, and the tab title names the page.

const at = (page: Page) => new URL(page.url()).hash;
const focusedIsPanel = (page: import("@playwright/test").Page, id: string) =>
  page.evaluate((id) => (document.activeElement as HTMLElement | null)?.dataset.screen === id, id);

test("clicking Work makes the address #work; back is the overview, forward is Work again", async ({ page }) => {
  await openTour(page);
  await clickLink(page, 1);
  await landedAt(page, 1);
  expect(at(page)).toBe("#work");
  await expect(page).toHaveTitle("Solace · Work · Adham Sedik");
  await page.goBack();
  await landedAt(page, 0);
  expect(at(page)).toBe("");
  await expect(page).toHaveTitle("Adham Sedik · Lab");
  await page.goForward();
  await landedAt(page, 1);
  expect(at(page)).toBe("#work");
  await expect(page).toHaveTitle("Solace · Work · Adham Sedik");
});

test("opening /#work lands on Work with its text showing and the camera still; back goes to the overview", async ({ page }) => {
  await page.goto("/#work");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await landedAt(page, 1);
  await expect(page).toHaveTitle("Solace · Work · Adham Sedik");
  await expect(panelOf(page, "work")).toBeVisible();
  const a = await readCamera(page);
  await page.waitForTimeout(500);
  expect(await readCamera(page), "no flight").toEqual(a);
  await page.goBack();
  await landedAt(page, 0);
  await expect(page).toHaveTitle("Adham Sedik · Lab");
  expect(new URL(page.url()).pathname).toBe("/");
  expect(at(page)).toBe("");
  await expect(panelOf(page, "work")).toBeHidden();
});

test("an unknown hash opens the overview", async ({ page }) => {
  await page.goto("/#nope");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await landedAt(page, 0);
});

test("a reload on /#projects lands there", async ({ page }) => {
  await page.goto("/#projects");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await landedAt(page, 2);
  await page.reload();
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await landedAt(page, 2);
  await expect(panelOf(page, "projects")).toBeVisible();
});

test("focus moves to the panel on landing, and back to the link on return", async ({ page }) => {
  await openTour(page);
  await waitForCamera(page);
  await hudLink(page, 3).focus();
  await clickLink(page, 3);
  await landedAt(page, 3);
  await expect.poll(() => focusedIsPanel(page, stationIds[2])).toBe(true);
  await hudLink(page, 0).click();
  await landedAt(page, 0);
  await expect(hudLink(page, 3)).toBeFocused();
});

// The keys move pages: Right is next(). A move to another station is a quick fade under reduced motion.
const right = (page: Page) => page.keyboard.press("ArrowRight");
const waitHash = (page: Page, hash: string) => expect.poll(() => at(page)).toBe(hash);

test.describe("pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("page moves replace the entry: Back after them goes to the previous monitor, then the overview", async ({ page }) => {
    await openTour(page);
    await right(page); // Work, Solace: a stop move, pushes
    await landedAt(page, 1);
    expect(at(page)).toBe("#work");
    await right(page); // Barracuda: a page move, replaces
    await waitHash(page, "#work/barracuda");
    await right(page); // Projects: pushes
    await landedAt(page, 2);
    expect(at(page)).toBe("#projects");
    await right(page); // Software factory: replaces
    await waitHash(page, "#projects/software-factory");
    await right(page); // MediaSafe: replaces
    await waitHash(page, "#projects/mediasafe");
    await page.goBack();
    await landedAt(page, 1);
    expect(at(page)).toBe("#work/barracuda");
    await expect(page).toHaveTitle("Barracuda · Work · Adham Sedik");
    await page.goBack();
    await landedAt(page, 0);
    expect(at(page)).toBe("");
    await page.goForward();
    await landedAt(page, 1);
    expect(at(page)).toBe("#work/barracuda");
    await page.goForward();
    await landedAt(page, 2);
    expect(at(page)).toBe("#projects/mediasafe");
    await expect(page).toHaveTitle("MediaSafe · Projects · Adham Sedik");
  });

  test("the tab title names the page after a page move, and the station alone on the Projects list", async ({ page }) => {
    await openTour(page);
    await right(page);
    await landedAt(page, 1);
    await expect(page).toHaveTitle("Solace · Work · Adham Sedik");
    await right(page);
    await expect(page).toHaveTitle("Barracuda · Work · Adham Sedik");
    await right(page);
    await landedAt(page, 2);
    await expect(page).toHaveTitle("Projects · Adham Sedik");
    await right(page);
    await expect(page).toHaveTitle("Software factory · Projects · Adham Sedik");
    await page.keyboard.press("Escape"); // up from a project page: the list
    await expect(page).toHaveTitle("Projects · Adham Sedik");
    await waitHash(page, "#projects");
  });

  for (const [old, hash, title] of [
    ["#mediasafe", "#projects/mediasafe", "MediaSafe · Projects · Adham Sedik"],
    ["#home-lab", "#projects/home-lab", "Home lab · Projects · Adham Sedik"],
    ["#software-factory", "#projects/software-factory", "Software factory · Projects · Adham Sedik"],
    ["#contact", "#about/contact", "Contact · About me · Adham Sedik"],
    ["#work/barracuda", "#work/barracuda", "Barracuda · Work · Adham Sedik"],
    ["#about/off-the-keyboard", "#about/off-the-keyboard", "Off the keyboard · About me · Adham Sedik"],
  ] as const) {
    test(`opening ${old} lands on ${hash} with no flight, and Back goes to the overview`, async ({ page }) => {
      await page.goto(`/${old}`);
      await expect(page.getByLabel("Boot log")).toBeHidden();
      await landedAt(page, old.includes("contact") || old.includes("about") ? 3 : old.includes("work") ? 1 : 2);
      expect(at(page)).toBe(hash);
      await expect(page).toHaveTitle(title);
      const a = await readCamera(page);
      await page.waitForTimeout(500);
      expect(await readCamera(page), "no flight").toEqual(a);
      await page.goBack();
      await landedAt(page, 0);
      expect(at(page)).toBe("");
      expect(new URL(page.url()).pathname).toBe("/");
      await expect(page).toHaveTitle("Adham Sedik · Lab");
    });
  }
});
