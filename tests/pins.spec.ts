import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { crts } from "../src/crts";
import { glassBox } from "../src/glass";
import { framingFor } from "../src/framing";
import { stations, ui } from "../src/content";
import { PIN_H } from "../src/pins";
import { hudLink, landedAt, openTour, stationIds, waitForCamera } from "./lib/page";

// The numbered pins over the three stations at the overview (#293). The rule that decides where they show is src/pins.test.ts's;
// these are the real clicks, hovers and Tab presses, and the real boxes: a pin's against the HUD's elements in the page.

const pin = (page: Page, i: number) => page.locator(`[data-pin="${stationIds[i]}"]`);
const canvas = (page: Page) => page.locator("canvas").first();
const barLine = (page: Page) => page.locator("[data-meter-bar] > span[data-live]");

/** Where TV `i`'s glass is in the window at the overview with the camera at rest (no parallax). */
function glassAt(i: number, size: { width: number; height: number }) {
  const s = framingFor(size).cameraAt({ kind: "at", stop: 0 });
  const cam = new PerspectiveCamera(s.fov, size.width / size.height, 0.01, 50);
  cam.position.set(...s.camera); cam.lookAt(new Vector3(...s.look)); cam.updateMatrixWorld();
  return glassBox(crts[i], cam, size);
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe("pins at 1440 x 900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 403, json: {} }));
    await openTour(page);
    await landedAt(page, 0);
    await waitForCamera(page);
  });

  test("show '1 Work', '2 Projects' and '3 About me', each above its own glass", async ({ page }) => {
    const size = page.viewportSize()!;
    for (const i of [0, 1, 2]) {
      await expect(page.getByRole("link", { name: ui.pins[stationIds[i]], exact: true })).toBeVisible();
      const box = (await pin(page, i).boundingBox())!, g = glassAt(i, size);
      expect(box.y + box.height, `pin ${i + 1} is above its glass`).toBeLessThanOrEqual(g.top);
      const x = box.x + box.width / 2;
      expect(x, `pin ${i + 1} is over its glass`).toBeGreaterThan(g.left - 20);
      expect(x).toBeLessThan(g.left + g.width + 20);
    }
  });

  // The camera slides with the pointer. Wherever it is, no pin meets the HUD's name block or its link row, or leaves the window.
  for (const [name, x, y] of [["top left", 1, 1], ["top right", 1438, 1], ["bottom left", 1, 898], ["bottom right", 1438, 898]] as const)
    test(`clear the HUD and the window with the pointer at the ${name} of the window`, async ({ page }) => {
      await page.mouse.move(x, y);
      await waitForCamera(page);
      const hud = [await page.locator("[data-name-block]").boundingBox(), await page.locator("[data-link-row]").boundingBox()];
      for (const i of [0, 1, 2]) {
        const box = (await pin(page, i).boundingBox())!;
        for (const h of hud) expect(overlaps(box, h!), `pin ${i + 1} meets the HUD`).toBe(false);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(1440);
      }
    });

  test("come after the HUD's links in the tab order, in tour order", async ({ page }) => {
    await page.getByRole("link", { name: "GitHub" }).focus(); // the HUD's last link
    for (const i of [0, 1, 2]) {
      await page.keyboard.press("Tab");
      await expect(pin(page, i), `Tab ${i + 1} after the HUD`).toBeFocused();
    }
    // and in the page, the pins follow the HUD's navigation
    const after = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="HUD"]')!, first = document.querySelector('[data-pin]')!;
      return !!(nav.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(after).toBe(true);
  });

  test("a click on a pin visits its station: the pins hide in the flight, and are back at the overview", async ({ page }) => {
    await pin(page, 1).click();
    for (const i of [0, 1, 2]) await expect(pin(page, i), "hidden in the flight").toBeHidden();
    await landedAt(page, 2);
    expect(page.url()).toContain(`#${stationIds[1]}`);
    for (const i of [0, 1, 2]) await expect(pin(page, i), "hidden at a station").toBeHidden();
    await hudLink(page, 0).click();
    await landedAt(page, 0);
    for (const i of [0, 1, 2]) await expect(pin(page, i), "back at the overview").toBeVisible();
  });

  test("Enter on a focused pin visits its station", async ({ page }) => {
    await pin(page, 2).focus();
    await page.keyboard.press("Enter");
    await landedAt(page, 3);
  });

  test("hovering a pin lights its TV's glow and previews its station on the meter; hovering the TV lights the pin", async ({ page }) => {
    const size = page.viewportSize()!;
    const gapLine = (await barLine(page).textContent())!;
    await pin(page, 1).hover();
    await expect.poll(() => canvas(page).getAttribute("data-lit")).toBe(stationIds[1]);
    await expect(barLine(page)).toHaveText(stations[1].name);
    await expect(pin(page, 1)).toHaveAttribute("data-lit", "");
    await expect(pin(page, 0)).not.toHaveAttribute("data-lit", "");
    await page.mouse.move(720, 2);
    await expect.poll(() => canvas(page).getAttribute("data-lit")).toBeNull();
    await expect(barLine(page)).toHaveText(gapLine);
    await expect(pin(page, 1)).not.toHaveAttribute("data-lit", "");
    // the TV the other way round
    const g = glassAt(2, size);
    await page.mouse.move(g.left + g.width / 2, g.top + g.height / 2);
    await expect(pin(page, 2)).toHaveAttribute("data-lit", "");
    await expect(barLine(page)).toHaveText(stations[2].name);
    await page.mouse.move(720, 2);
    await expect(pin(page, 2)).not.toHaveAttribute("data-lit", "");
  });

  test("are as tall as the rule in src/pins.ts takes them, and ease in and out", async ({ page }) => {
    expect((await pin(page, 0).boundingBox())!.height).toBe(PIN_H);
    expect(await pin(page, 0).evaluate((el) => getComputedStyle(el).transitionDuration)).toContain("0.25s");
  });
});

test.describe("reduced motion at 1440 x 900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("the pins show and hide without easing", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openTour(page);
    await landedAt(page, 0);
    for (const i of [0, 1, 2]) {
      await expect(pin(page, i)).toBeVisible();
      expect(await pin(page, i).evaluate((el) => getComputedStyle(el).transitionDuration), "no ease").toBe("0s");
    }
  });
});

test.describe("where the pins do not show", () => {
  test("a window the two-line HUD has (1024 x 768) has none", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openTour(page);
    await landedAt(page, 0);
    for (const i of [0, 1, 2]) await expect(pin(page, i)).toBeHidden();
  });

  test("a phone in portrait has none (hidden, so out of the tab order too)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTour(page);
    await landedAt(page, 0);
    for (const i of [0, 1, 2]) await expect(pin(page, i)).toBeHidden();
    for (const i of [0, 1, 2]) expect(await pin(page, i).evaluate((el) => getComputedStyle(el).visibility)).toBe("hidden");
  });
});
