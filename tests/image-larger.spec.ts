import { test, expect, type Locator, type Page } from "@playwright/test";
import { goTo, hudLink, landedAt, openTour, panelOf, waitForPanel, stationIds } from "./lib/page";
import { stations, ui } from "../src/content";

// #344: the MediaSafe screenshot opens larger. The small image is inside a button, a click, Enter or Space opens it in a dialog inside the
// panel, and Esc, Close or a click on the image shuts it. Any move of the tour shuts it and then moves. The portrait has no button.
const PROJECTS = stationIds.indexOf("projects") + 1;
const ABOUT = stationIds.indexOf("about") + 1;
const shot = stations.find((s) => s.id === "projects")!.pages.find((p) => p.id === "mediasafe")!.image!;
const isShot = (url: string) => /\/mediasafe-library[^/]*\.jpg(\?|$)/.test(url);
const panel = (page: Page) => panelOf(page, "projects");
const opener = (page: Page) => panel(page).getByRole("button", { name: ui.imageLarger.open, exact: true });
const dialog = (page: Page) => panel(page).getByRole("dialog", { name: shot.alt, exact: true });
const close = (page: Page) => dialog(page).getByRole("button", { name: ui.imageLarger.close, exact: true });
const bigImage = (page: Page) => dialog(page).locator("img");
const hash = (page: Page) => new URL(page.url()).hash;

/** Opens the MediaSafe page as a visitor does (the Projects monitor, then its list row) and waits for the small image to load. */
async function openMediaSafe(page: Page) {
  await openTour(page);
  await goTo(page, PROJECTS);
  await panel(page).locator('[data-row="mediasafe"]').click();
  await waitForPanel(page, "projects");
  await expect(opener(page)).toBeVisible();
  await expect.poll(() => opener(page).locator("img").evaluate((i: HTMLImageElement) => i.complete && i.naturalHeight)).toBeGreaterThan(0);
}
/** Is `inner` inside `outer`, as the page draws them (a pixel of slack for rounding)? */
async function inside(inner: Locator, outer: Locator) {
  const a = (await inner.boundingBox())!, b = (await outer.boundingBox())!;
  return a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.width <= b.x + b.width + 1 && a.y + a.height <= b.y + b.height + 1;
}

test.describe("opening", () => {
  test("a click opens it: a dialog named by the image's alt text, focus on Close", async ({ page }) => {
    await openMediaSafe(page);
    await expect(dialog(page)).toHaveCount(0);
    await opener(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(close(page)).toBeFocused();
    await expect(dialog(page)).toHaveAttribute("aria-modal", "true");
  });
  for (const key of ["Enter", "Space"]) {
    test(`${key} on the focused button opens it`, async ({ page }) => {
      await openMediaSafe(page);
      await opener(page).focus();
      await page.keyboard.press(key);
      await expect(dialog(page)).toBeVisible();
      await expect(close(page)).toBeFocused();
    });
  }
  test("Tab leaves focus on Close, and so does Shift+Tab", async ({ page }) => {
    await openMediaSafe(page);
    await opener(page).click();
    await expect(close(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close(page)).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(close(page)).toBeFocused();
  });
  test("it opens at once, with no animation", async ({ page }) => {
    await openMediaSafe(page);
    await opener(page).click();
    const css = await dialog(page).evaluate((d) => ({ a: getComputedStyle(d).animationName, t: getComputedStyle(d).transitionDuration, o: getComputedStyle(d).opacity }));
    expect(css).toEqual({ a: "none", t: "0s", o: "1" });
  });
});

test.describe("shutting", () => {
  for (const how of ["Esc", "Close", "a click on the image"] as const) {
    test(`${how} shuts it and focus goes back to the button that opened it`, async ({ page }) => {
      await openMediaSafe(page);
      await opener(page).click();
      await expect(dialog(page)).toBeVisible();
      if (how === "Esc") await page.keyboard.press("Escape");
      else if (how === "Close") await close(page).click();
      else await bigImage(page).click();
      await expect(dialog(page)).toHaveCount(0);
      await expect(opener(page)).toBeFocused();
      // and it can be opened again
      await page.keyboard.press("Enter");
      await expect(dialog(page)).toBeVisible();
    });
  }
  test("with it open, Esc only shuts it: the visitor stays on the MediaSafe page", async ({ page }) => {
    await openMediaSafe(page);
    await opener(page).click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await page.waitForTimeout(400); // a move up would have begun by now
    expect(hash(page)).toBe("#projects/mediasafe");
    await expect(panel(page).locator("[data-stat]")).toBeVisible();
    await expect(opener(page)).toBeVisible();
    // the next Esc is the old Esc: up to the Projects list
    await page.keyboard.press("Escape");
    await expect(panel(page).locator("[data-list]")).toBeVisible();
    expect(hash(page)).toBe("#projects");
  });
});

test.describe("a move of the tour shuts it and then moves", () => {
  test("an arrow key", async ({ page }) => {
    await openMediaSafe(page);
    await opener(page).click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => hash(page)).toBe("#projects/home-lab");
    await page.keyboard.press("ArrowLeft"); // back to MediaSafe: it is shut
    await expect.poll(() => hash(page)).toBe("#projects/mediasafe");
    await expect(dialog(page)).toHaveCount(0);
  });
  test("the browser's Back", async ({ page }) => {
    await openMediaSafe(page);
    await opener(page).click();
    await expect(dialog(page)).toBeVisible();
    await page.goBack();
    await landedAt(page, 0);
    await expect(dialog(page)).toHaveCount(0);
  });
  test("a HUD link", async ({ page }) => {
    await openMediaSafe(page);
    await opener(page).click();
    await expect(dialog(page)).toBeVisible();
    await goTo(page, 1);
    await expect(dialog(page)).toHaveCount(0);
    await goTo(page, PROJECTS);
    await expect(dialog(page)).toHaveCount(0);
  });
  test("the page's own Next button, and the breadcrumb's link", async ({ page }) => {
    await openMediaSafe(page);
    await opener(page).click();
    await expect(dialog(page)).toBeVisible();
    // the dialog covers the buttons below it, so a keyboard user can't reach them; a script's click is the test's way to ask the move
    await panel(page).locator('[data-btn="next"]').dispatchEvent("click");
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => hash(page)).toBe("#projects/home-lab");
    // and the breadcrumb: a real click can't reach it either (the dialog covers the whole visible panel), so the script asks for it too
    await page.keyboard.press("ArrowLeft"); // back to MediaSafe
    await expect.poll(() => hash(page)).toBe("#projects/mediasafe");
    await opener(page).click();
    await expect(dialog(page)).toBeVisible();
    await panel(page).locator("[data-crumb] a").dispatchEvent("click");
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => hash(page)).toBe("#projects");
  });
});

// #388: a re-render of the tour while the dialog is open must leave focus and the dialog's top where they were. The panel handed the dialog a
// new `shot` object each render, and the dialog's layout effect depended on it, so every re-render reset the top and refocused Close.
// The window is short (1280x560) so the MediaSafe page overflows its panel: at 1280x720 it fits, the panel can't scroll, and the top is 0 before and after
// whether or not the dialog resets it, so only the focus check would catch the bug. Here the panel is scrolled and the test asserts it moved.
test("a re-render of the tour with the dialog open leaves focus on the dialog and its top where it was", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await openMediaSafe(page);
  await opener(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect.poll(async () => (await bigImage(page).boundingBox())?.width ?? 0).toBeGreaterThan(100);
  // a click on the dialog's empty glass: focus moves from Close to the dialog itself (tabIndex -1)
  const box = (await dialog(page).boundingBox())!;
  await page.mouse.click(box.x + 6, box.y + box.height / 2);
  await expect(dialog(page)).toBeFocused();
  // the panel doesn't scroll for the visitor while the dialog is open, but a script can move it: the dialog's top must stay where the dialog opened
  const top = () => dialog(page).evaluate((d) => (d as HTMLElement).style.top);
  const before = await top();
  const scrolledFrom = await panel(page).evaluate((p) => p.scrollTop);
  await panel(page).evaluate((p) => { p.scrollTop = p.scrollTop + 40; });
  expect(await panel(page).evaluate((p) => p.scrollTop), "the panel really scrolled, or the top check below sees nothing").toBeGreaterThan(scrolledFrom);
  // a pointer on a HUD link makes the tour re-render (its hover preview changes), and the link only previews, so the dialog stays open
  await hudLink(page, 2).hover();
  await page.waitForTimeout(300); // past the render the hover asks for
  await hudLink(page, 1).hover(); // and another, in case the first re-render came before the scroll above settled
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page), "focus is still on the dialog, not pulled back to Close").toBeFocused();
  expect(await top(), "the dialog's top has not moved").toBe(before);
});

test("a click on the open image does not go back to the overview", async ({ page }) => {
  await openMediaSafe(page);
  await opener(page).click();
  const box = (await bigImage(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(dialog(page)).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(hash(page)).toBe("#projects/mediasafe");
  await expect(panel(page).locator("[data-stat]")).toBeVisible();
  await expect(page.getByRole("navigation", { name: ui.hudLabel }).getByRole("link", { name: stations[PROJECTS - 1].name, exact: true })).toHaveAttribute("aria-current", "location");
});

for (const [w, h] of [[1280, 720], [390, 844]] as const) {
  test(`at ${w}x${h} the open image is inside the panel, and as large as fits`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openMediaSafe(page);
    await opener(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect.poll(async () => (await bigImage(page).boundingBox())?.width ?? 0).toBeGreaterThan(100);
    expect(await inside(bigImage(page), panel(page)), "the image is inside the panel").toBe(true);
    expect(await inside(close(page), panel(page)), "Close is inside the panel").toBe(true);
    const small = (await opener(page).locator("img").boundingBox())!;
    const big = (await bigImage(page).boundingBox())!;
    expect(big.width, "larger than the small image").toBeGreaterThan(small.width * 1.2);
    expect(Math.abs(big.width / big.height - 972 / 540), "keeps the file's shape").toBeLessThan(0.03);
    // as large as fits: it fills the stage's width or its height
    const stage = (await dialog(page).locator(".crt-large-stage").boundingBox())!;
    expect(Math.min(stage.width - big.width, stage.height - big.height), "one side fills the stage").toBeLessThan(3);
  });
  test(`at ${w}x${h} it opens in the panel's view even when the panel has scrolled`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openMediaSafe(page);
    await panel(page).evaluate((p) => { p.scrollTop = p.scrollHeight; });
    await opener(page).scrollIntoViewIfNeeded();
    await opener(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect.poll(async () => (await bigImage(page).boundingBox())?.width ?? 0).toBeGreaterThan(100);
    expect(await inside(bigImage(page), panel(page))).toBe(true);
    expect(await inside(close(page), panel(page))).toBe(true);
  });
  test(`at ${w}x${h} a click on the dialog's empty padding does not let Tab out of it`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openMediaSafe(page);
    await opener(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect.poll(async () => (await bigImage(page).boundingBox())?.width ?? 0).toBeGreaterThan(100);
    const top = await panel(page).evaluate((p) => p.scrollTop);
    const box = (await dialog(page).boundingBox())!;
    const stage = (await dialog(page).locator(".crt-large-stage").boundingBox())!;
    const big = (await bigImage(page).boundingBox())!;
    // two clicks on empty glass: the dialog's left padding, and the stage beside (or above) the image
    const empties = [{ x: box.x + 6, y: box.y + box.height / 2 }, { x: stage.x + 2, y: stage.y + 2 }];
    for (const at of empties) {
      expect(at.x < big.x || at.y < big.y, "the click is not on the image").toBe(true);
      await page.mouse.click(at.x, at.y);
      await expect(dialog(page), "a click on its background does not shut it").toBeVisible();
      for (const key of ["Tab", "Tab", "Shift+Tab", "Tab"]) {
        await page.keyboard.press(key);
        expect(await page.evaluate(() => !!document.activeElement?.closest(".crt-large")), `focus is in the dialog after ${key}`).toBe(true);
        await expect(close(page)).toBeFocused();
      }
      expect(await panel(page).evaluate((p) => p.scrollTop), "the panel has not scrolled").toBe(top);
      expect(await inside(dialog(page), panel(page)), "the dialog still covers the panel's view").toBe(true);
    }
  });
}

test("the portrait has no button", async ({ page }) => {
  await openTour(page);
  await goTo(page, ABOUT);
  const portrait = stations.find((s) => s.id === "about")!.pages[0].image!;
  await expect(panelOf(page, "about").getByRole("img", { name: portrait.alt })).toBeVisible();
  await expect(panelOf(page, "about").getByRole("button", { name: ui.imageLarger.open })).toHaveCount(0);
  await expect(panelOf(page, "about").locator(".crt-photo-btn")).toHaveCount(0);
});

test("with the screenshot's request blocked, the page shows no image and no button", async ({ page }) => {
  let asked = 0;
  await page.route((u) => isShot(u.href), (r) => { asked++; return r.fulfill({ status: 404 }); });
  await openTour(page);
  await goTo(page, PROJECTS);
  await panel(page).locator('[data-row="mediasafe"]').click();
  await waitForPanel(page, "projects");
  await expect.poll(() => asked).toBeGreaterThan(0);
  await expect(panel(page).locator("[data-photo]")).toHaveCount(0);
  await expect(panel(page).getByRole("img", { name: shot.alt })).toHaveCount(0);
  await expect(opener(page)).toHaveCount(0);
  await expect(panel(page).locator("[data-lead]")).toBeVisible();
});
