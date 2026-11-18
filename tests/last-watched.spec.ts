import { test, expect, type Page } from "@playwright/test";
import { goTo, openTour, panelOf, readDrawnCamera, stationIds, waitForPanel } from "./lib/page";
import { LAST_WATCHED_MAX, LAST_WATCHED_URL } from "../src/last-watched";

// #369: the Last watched line on Off the keyboard (ADR-0008). Every answer here is a fake served with page.route: no spec calls production
// MediaSafe, and playwright.config.ts makes its host unreachable for every spec, so a call that is not served fails (the first test shows both).
// The call is cross-origin from the test server, so every fake answer sends the any-origin header, as the real one does; without it the browser
// refuses the answer and the "hidden on failure" test would pass for the wrong reason.
const ABOUT = stationIds.indexOf("about") + 1;
const panel = (page: Page) => panelOf(page, "about");
const line = (page: Page) => panel(page).locator("[data-last-watched]");
const isLink = (u: URL) => u.href === LAST_WATCHED_URL;

/** Serves `title` as MediaSafe does (text/plain, any origin) and counts the calls. `status` other than 200 serves a failure, with the same headers. */
async function serve(page: Page, title: string, status = 200) {
  const calls = { n: 0 };
  await page.route(isLink, (route) => {
    calls.n++;
    return route.fulfill({
      status, body: title,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "text/plain; charset=utf-8" },
    });
  });
  return calls;
}
/** Opens Off the keyboard as a visitor does: the About me monitor, then its tab. */
async function openOffTheKeyboard(page: Page) {
  await openTour(page);
  await goTo(page, ABOUT);
  await panel(page).locator('[data-tabs] [data-page="off-the-keyboard"]').click();
  await waitForPanel(page, "about");
}
const watching = (page: Page) => panel(page).getByText("Films and shows.", { exact: false });

test("a served answer shows the line on Off the keyboard, under the watching bullet, and on no other page; MediaSafe's host is unreachable otherwise", async ({ page }) => {
  const calls = await serve(page, "Severance");
  await openOffTheKeyboard(page);
  await expect(line(page)).toHaveText("Last watched: Severance");
  // inside the watching bullet, under its sentence and aligned with its text
  await expect(panel(page).locator("li", { has: page.locator("[data-last-watched]") })).toContainText("Films and shows.");
  const at = await line(page).evaluate((el) => {
    const sentence = document.createRange();
    sentence.selectNodeContents(el.parentElement!.firstChild!);
    const s = sentence.getBoundingClientRect(), l = el.getBoundingClientRect();
    return { sentenceBottom: s.bottom, sentenceLeft: s.left, top: l.top, left: l.left };
  });
  expect(at.top, "under the sentence").toBeGreaterThanOrEqual(at.sentenceBottom - 1);
  expect(Math.abs(at.left - at.sentenceLeft), "aligned with the bullet's text").toBeLessThan(2);
  expect(await panel(page).locator("[data-last-watched]").count()).toBe(1);
  // on no other page of About me, and on no other station
  await panel(page).locator('[data-tabs] [data-page="contact"]').click();
  await expect(panel(page).locator("[data-page=contact][aria-current=page]")).toBeVisible();
  await expect(line(page)).toHaveCount(0);
  await panel(page).locator('[data-tabs] [data-page="why-i-do-this"]').click();
  await expect(panel(page).locator("[data-page=why-i-do-this][aria-current=page]")).toBeVisible();
  await expect(line(page)).toHaveCount(0);
  await expect(page.locator("[data-last-watched]")).toHaveCount(0);
  expect(calls.n).toBe(1);
  // The route answered with the block on. A call to MediaSafe's host that no route serves doesn't resolve (a no-cors fetch rejects only on a network error).
  const reached = await page.evaluate(() => fetch("https://mediasafe.space/not-served-by-this-test", { mode: "no-cors" }).then(() => "reached", () => "blocked"));
  expect(reached).toBe("blocked");
});

test("no call is made at boot, at another station or on another page before Off the keyboard is shown; going away and back makes no second call", async ({ page }) => {
  const calls = await serve(page, "Severance");
  await openTour(page);
  expect(calls.n).toBe(0);
  await goTo(page, 1);
  await goTo(page, 2);
  await goTo(page, ABOUT);
  await expect(panel(page).locator("[data-lead]")).toBeVisible(); // About me's first page
  await panel(page).locator('[data-tabs] [data-page="contact"]').click();
  await expect(panel(page).locator("[data-page=contact][aria-current=page]")).toBeVisible();
  expect(calls.n).toBe(0);
  await panel(page).locator('[data-tabs] [data-page="off-the-keyboard"]').click();
  await expect(line(page)).toHaveText("Last watched: Severance");
  expect(calls.n).toBe(1);
  // away (another page, another station) and back: the same answer, no second call
  await panel(page).locator('[data-tabs] [data-page="contact"]').click();
  await expect(line(page)).toHaveCount(0);
  await goTo(page, 1);
  await goTo(page, ABOUT);
  await panel(page).locator('[data-tabs] [data-page="off-the-keyboard"]').click();
  await expect(line(page)).toHaveText("Last watched: Severance");
  expect(calls.n).toBe(1);
});

test("a direct link to Off the keyboard reads at boot", async ({ page }) => {
  const calls = await serve(page, "Severance");
  await page.goto("/#about/off-the-keyboard");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await expect(line(page)).toHaveText("Last watched: Severance");
  expect(calls.n).toBe(1);
});

test("with the call failing the bullet shows and the line does not", async ({ page }) => {
  const calls = await serve(page, "Severance", 404);
  await openOffTheKeyboard(page);
  await expect.poll(() => calls.n).toBe(1);
  await expect(watching(page)).toBeVisible();
  // give the answer time to be wrongly shown: a page's later frames and the read's own promise turns
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await expect(line(page)).toHaveCount(0);
  await expect(panel(page)).not.toContainText("Last watched");
});

test("with the host unreachable (no answer served) the bullet shows and the line does not", async ({ page }) => {
  await openOffTheKeyboard(page);
  await expect(watching(page)).toBeVisible();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await expect(line(page)).toHaveCount(0);
});

test("a title with markup shows as text: no b element", async ({ page }) => {
  await serve(page, "<b>x</b>");
  await openOffTheKeyboard(page);
  await expect(line(page)).toHaveText("Last watched: <b>x</b>");
  expect(await panel(page).locator("b").count()).toBe(0);
  expect(await line(page).locator("*").count()).toBe(0);
});

test("the line shows in portrait (390x844) and on a short landscape window (667x375), with no animation", async ({ page }) => {
  await serve(page, "Severance");
  for (const [width, height] of [[390, 844], [667, 375]] as const) {
    await page.setViewportSize({ width, height });
    await openOffTheKeyboard(page);
    await expect(line(page), `at ${width}x${height}`).toHaveText("Last watched: Severance");
    await expect(line(page)).toBeVisible();
    expect(await line(page).evaluate((el) => el.getAnimations().length), "no animation on the line").toBe(0);
    await page.goto("about:blank");
  }
});

test("at 390x844 an 80-character title with no spaces is one line high, cut with an ellipsis, and runs off neither side", async ({ page }) => {
  const long = "W".repeat(LAST_WATCHED_MAX);
  expect([...long].length).toBe(80);
  await serve(page, long);
  await page.setViewportSize({ width: 390, height: 844 });
  await openOffTheKeyboard(page);
  await expect(line(page)).toContainText("WWWW");
  const m = await line(page).evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      h: el.getBoundingClientRect().height, lineHeight: parseFloat(cs.lineHeight), overflow: cs.textOverflow, wrap: cs.whiteSpace,
      cut: el.scrollWidth > el.clientWidth,
    };
  });
  expect(m.h, "one line high").toBeLessThanOrEqual(m.lineHeight + 1);
  expect(m.wrap).toBe("nowrap");
  expect(m.overflow, "cut with an ellipsis").toBe("ellipsis");
  expect(m.cut, "the title is wider than the line, so the ellipsis is drawn").toBe(true);
  const over = await panel(page).evaluate((p) => p.scrollWidth - p.clientWidth);
  expect(over, "nothing runs off the side").toBeLessThanOrEqual(4);
});

test("the cue is worked out again when a late answer lands: off before it, on after it, with no frame asked for in between", async ({ page }) => {
  // The answer is held back, then released: it can arrive up to 5 s after the page is shown, and no space is held for the line.
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route(isLink, async (route) => {
    await gate;
    await route.fulfill({ status: 200, body: "Severance", headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "text/plain; charset=utf-8" } });
  });
  await openOffTheKeyboard(page);
  await expect(watching(page)).toBeVisible();
  await expect(line(page)).toHaveCount(0);
  // the photo is several lines tall, and a late image changes the height: wait for it
  await expect.poll(() => panel(page).evaluate((p) => [...p.querySelectorAll("img")].every((i) => i.complete))).toBe(true);
  // Add lines under the bullets until the page is just under the cue's threshold (src/text/more.ts), as tests/golf-photo.spec.ts does for its edge,
  // so the line's arrival tips it over on any machine: whole lines until one too many, then one px at a time (the line is shorter than a bullet).
  const THRESHOLD_PX = 4;
  await panel(page).evaluate((p, threshold) => {
    const list = p.querySelector("ul:not([data-list] ul)")!;
    const over = () => p.scrollHeight - p.clientHeight;
    const last = list.lastElementChild!;
    const added: HTMLElement[] = [];
    while (over() <= threshold) {
      const l = last.cloneNode(false) as HTMLElement;
      l.textContent = "A line the test added.";
      list.append(l);
      added.push(l);
    }
    added.pop()!.remove(); // one line too many: now the page fits, by less than a line
    const spacer = document.createElement("li");
    spacer.style.cssText = "margin:0;padding:0;list-style:none;height:0px";
    list.append(spacer);
    let h = 0;
    while (over() <= threshold) spacer.style.height = `${++h}px`;
    spacer.style.height = `${Math.max(0, h - 2)}px`; // just under: at most the threshold, with a px or two to spare
  }, THRESHOLD_PX);
  await readDrawnCamera(page); // the cue is worked out on a frame the room draws
  const before = await panel(page).evaluate((p) => ({ more: p.dataset.more, over: p.scrollHeight - p.clientHeight }));
  expect(before.over, "just under the threshold").toBeLessThanOrEqual(THRESHOLD_PX);
  expect(before.over, "and not far under it").toBeGreaterThan(THRESHOLD_PX - 4);
  expect(before.more, "the cue is off before the answer").not.toBe("true");
  release();
  await expect(line(page)).toHaveText("Last watched: Severance");
  // worked out again by the panel itself: no scroll, no page change and no frame asked for since the answer
  await expect(panel(page)).toHaveAttribute("data-more", "true");
  const after = await panel(page).evaluate((p) => p.scrollHeight - p.clientHeight);
  expect(after, "the line pushed the page past the threshold").toBeGreaterThan(THRESHOLD_PX);
});
