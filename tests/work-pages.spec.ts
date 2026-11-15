import { test, expect, type Page } from "@playwright/test";
import { stations } from "../src/content";
import { SHIFT_SECONDS } from "../src/nixie";
import { busiestWindow, MAX_CHANGES_PER_SECOND, SNAP_BACK_MS } from "../src/shift";
import { countDraws, draws, frames, goBack, landedAt, overflowPanel, panelOf, waitUntilStill } from "./lib/page";
import { backButton, crumb, hash, heading, nextButton, openStation, row, shownText, tab } from "./lib/pages";
import { defineSnapWatcher } from "./lib/snap";
import { WORK_COPY, WORK_LEADS } from "./fixtures/work-copy";

// Pages on the glass (#284): Work's two pages are tabs, Projects is a list with a page for each project, and every station
// has a Back and a Next button that name where they go. The glass shows the visit's page, so a click on a control moves the
// visit and the URL follows. (Work's timeline of segments retired here.) The page change's flick is on every station.
const work = stations.find((s) => s.id === "work")!;
const projects = stations.find((s) => s.id === "projects")!;
const [solace, barracuda] = work.pages;
const workPanel = (page: Page) => panelOf(page, "work");
const openWork = (page: Page, w: number, h: number) => openStation(page, 1, "work", { width: w, height: h });
const sizeOf = (page: Page, id: string) => panelOf(page, id).evaluate((e) => ({ w: e.scrollWidth, c: e.clientWidth }));

for (const [w, h] of [[1280, 800], [1920, 1080]]) {
  test(`desktop ${w}x${h}: Work opens on Solace with its breadcrumb and two tabs, and a click or Enter on a tab turns the page`, async ({ page }) => {
    test.setTimeout(90_000);
    await openWork(page, w, h);

    // opens on Solace, with its text only; the open tab is filled and marked, the other is outlined
    await expect(crumb(page, "work")).toHaveText("Monitor 1 · Work");
    await expect(heading(page, "work")).toHaveText("Work experience");
    await expect(workPanel(page).locator("button[data-page]")).toHaveText([/Solace/, /Barracuda/]); // in page order, newest first
    await expect(tab(page, "work", "solace")).toHaveAttribute("aria-current", "page");
    await expect(tab(page, "work", "barracuda")).not.toHaveAttribute("aria-current", "page");
    await expect(tab(page, "work", "barracuda")).toContainText(barracuda.dates!);
    expect(await shownText(page, "work")).toEqual(expect.arrayContaining([solace.lead!, ...solace.body]));
    expect(await shownText(page, "work")).not.toContain(barracuda.lead);
    expect(await tab(page, "work", "barracuda").evaluate((e) => getComputedStyle(e).cursor)).toBe("pointer");
    // the timeline has retired
    await expect(workPanel(page).locator("[data-timeline], .crt-seg")).toHaveCount(0);
    await expect(workPanel(page)).not.toContainText("Click a job to read it");
    await page.screenshot({ path: `test-results/work-${w}x${h}-solace.png` });

    // a click on the other tab calls the visit: the panel, the URL and history follow
    const entries = await page.evaluate(() => history.length);
    await tab(page, "work", "barracuda").click();
    await expect(tab(page, "work", "barracuda")).toHaveAttribute("aria-current", "page");
    await expect(tab(page, "work", "solace")).not.toHaveAttribute("aria-current", "page");
    expect(await shownText(page, "work")).toEqual(expect.arrayContaining([barracuda.lead!, ...barracuda.body]));
    expect(await shownText(page, "work")).not.toContain(solace.lead); // turning the page changes the lead
    expect(await hash(page)).toBe("#work/barracuda");
    expect(await page.evaluate(() => history.length), "a page change replaces the entry").toBe(entries);
    await page.screenshot({ path: `test-results/work-${w}x${h}-barracuda.png` });

    // Enter on a focused tab, from the keyboard
    await tab(page, "work", "solace").focus();
    await page.keyboard.press("Enter");
    await expect(tab(page, "work", "solace")).toHaveAttribute("aria-current", "page");
    expect(await hash(page)).toBe("#work");
    expect(await shownText(page, "work")).toEqual(expect.arrayContaining(solace.body));

    // every paragraph of the approved copy is reachable on one page or the other
    const seen = new Set(await shownText(page, "work"));
    await tab(page, "work", "barracuda").click();
    (await shownText(page, "work")).forEach((t) => seen.add(t));
    for (const b of [...WORK_LEADS, ...WORK_COPY]) expect(seen, b).toContain(b);
  });
}

test("the glass shows the visit's page: the arrow keys and the browser's Back move it too", async ({ page }) => {
  test.setTimeout(90_000);
  await openWork(page, 1280, 800);
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "work", "barracuda")).toHaveAttribute("aria-current", "page"); // → is next(): not local state
  await page.keyboard.press("ArrowLeft");
  await expect(tab(page, "work", "solace")).toHaveAttribute("aria-current", "page");
  // Back goes to the previous monitor or the overview, not through the pages
  await tab(page, "work", "barracuda").click();
  await expect(tab(page, "work", "barracuda")).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await landedAt(page, 0);
});

test("Next and Back across Work and Projects: each names where it goes, and goes there", async ({ page }) => {
  test.setTimeout(120_000);
  await openWork(page, 1280, 800);
  await expect(backButton(page, "work")).toHaveCount(0); // the first page of a station has no Back
  await expect(nextButton(page, "work")).toHaveText("Next job: Barracuda →");
  await nextButton(page, "work").click();
  await expect(tab(page, "work", "barracuda")).toHaveAttribute("aria-current", "page");
  await expect(backButton(page, "work")).toHaveText("← Solace");
  await expect(nextButton(page, "work")).toHaveText("Next: Projects →");
  await backButton(page, "work").click();
  await expect(tab(page, "work", "solace")).toHaveAttribute("aria-current", "page");
  await nextButton(page, "work").click();
  await expect(nextButton(page, "work")).toHaveText("Next: Projects →");

  // across the station boundary: the camera flies to the Projects list
  await nextButton(page, "work").click();
  await landedAt(page, 2);
  await expect(panelOf(page, "projects")).toHaveCSS("opacity", "1");
  await expect(crumb(page, "projects")).toHaveText("Monitor 2 · Projects");
  await expect(heading(page, "projects")).toHaveText("Things I've built and run");
  await expect(panelOf(page, "projects").locator("p").filter({ hasText: "~/projects $ ls" })).toBeVisible();
  await expect(panelOf(page, "projects").locator("button[data-row]")).toHaveCount(3);
  await expect(panelOf(page, "projects")).toContainText("Pick a project to open it.");
  await expect(nextButton(page, "projects")).toHaveCount(0);

  // each row opens its project; the project's Back and Next name where they go
  await row(page, "projects", "mediasafe").click();
  await expect(crumb(page, "projects")).toHaveText("~/projects / mediasafe");
  await expect(heading(page, "projects")).toHaveText("MediaSafe");
  expect(await hash(page)).toBe("#projects/mediasafe");
  await expect(backButton(page, "projects")).toHaveText("← Software factory");
  await expect(nextButton(page, "projects")).toHaveText("Next project: Home lab →");
  await backButton(page, "projects").click();
  await expect(backButton(page, "projects")).toHaveText("← All projects");
  await expect(nextButton(page, "projects")).toHaveText("Next project: MediaSafe →");
  await backButton(page, "projects").click(); // back to the list
  await expect(crumb(page, "projects")).toHaveText("Monitor 2 · Projects");
  await row(page, "projects", "home-lab").click();
  await expect(nextButton(page, "projects")).toHaveText("Next: About me →");
  // the breadcrumb's ~/projects goes to the list
  await crumb(page, "projects").getByRole("link", { name: "~/projects" }).click();
  await expect(crumb(page, "projects")).toHaveText("Monitor 2 · Projects");
  expect(await hash(page)).toBe("#projects");
  // and Next off the last project goes on to About me, and its last page's Next goes back to the overview
  await row(page, "projects", "home-lab").click();
  await nextButton(page, "projects").click();
  await landedAt(page, 3);
  await expect(panelOf(page, "about")).toHaveCSS("opacity", "1");
  await expect(crumb(page, "about")).toHaveText("Monitor 3 · About me");
  await expect(nextButton(page, "about")).toHaveText("Next: Off the keyboard →");
  await nextButton(page, "about").click();
  await expect(nextButton(page, "about")).toHaveText("Next: Contact →");
  await nextButton(page, "about").click();
  await expect(nextButton(page, "about")).toHaveText("Back to overview");
  await nextButton(page, "about").click();
  await landedAt(page, 0);
});

test("a project opened from the list shows its stat, its diagram and its links, and the list shows each project's tag and stat", async ({ page }) => {
  test.setTimeout(90_000);
  await openStation(page, 2, "projects", { width: 1280, height: 800 });
  for (const r of projects.pages[0].list!.rows) {
    const p = projects.pages.find((x) => x.id === r.page)!;
    await expect(row(page, "projects", r.page)).toContainText(r.name);
    await expect(row(page, "projects", r.page)).toContainText(r.tag);
    await expect(row(page, "projects", r.page)).toContainText(p.stat!);
  }
  await page.screenshot({ path: "test-results/projects-list.png" });
  await row(page, "projects", "software-factory").click();
  const p = projects.pages.find((x) => x.id === "software-factory")!;
  expect(await shownText(page, "projects")).toEqual(expect.arrayContaining([p.lead!, ...p.body]));
  await expect(panelOf(page, "projects").locator("[data-stat]")).toHaveText(p.stat!);
  await expect(panelOf(page, "projects").locator("figure[data-diagram]")).toBeVisible();
  await page.screenshot({ path: "test-results/projects-project.png" });
});

test("a phone shows the same controls, inside the panel", async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await openStation(page, 1, "work");
  const panel = (await panelOf(page, "work").boundingBox())!;
  for (const control of [tab(page, "work", "solace"), tab(page, "work", "barracuda"), nextButton(page, "work")]) {
    const b = (await control.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(panel.x);
    expect(b.x + b.width).toBeLessThanOrEqual(panel.x + panel.width);
    expect(b.y + b.height).toBeLessThanOrEqual(panel.y + panel.height);
  }
  await tab(page, "work", "barracuda").tap();
  await expect(backButton(page, "work")).toHaveText("← Solace");
  expect((await sizeOf(page, "work")).w).toBeLessThanOrEqual((await sizeOf(page, "work")).c);
  await page.screenshot({ path: "test-results/work-390x844-barracuda.png" });
  await ctx.close();
});

test("scrolling does not turn the page", async ({ page }) => {
  test.setTimeout(90_000);
  await openWork(page, 1280, 800);
  await overflowPanel(page, "work"); // the real copy is too short to scroll, so the test makes it
  const box = (await workPanel(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 30); await page.waitForTimeout(80); }
  // the wheel did reach the panel and scroll its text, and still the page did not turn
  expect(await workPanel(page).evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  await expect(tab(page, "work", "solace")).toHaveAttribute("aria-current", "page");
  await expect(tab(page, "work", "barracuda")).not.toHaveAttribute("aria-current", "page");
});

test("a turn starts the new page at its top, and the Back and Next row stays on the glass while the text scrolls", async ({ page }) => {
  test.setTimeout(90_000);
  await openWork(page, 1280, 800);
  await overflowPanel(page, "work"); // the real copy is too short to scroll, so the test makes it
  await workPanel(page).evaluate((e) => { e.scrollTop = 1e6; });
  const before = await workPanel(page).evaluate((e) => e.scrollTop);
  expect(before, "the panel was scrolled before the turn").toBeGreaterThan(0);
  // scrolled to the end or not, the Next button is inside the panel's box
  const panelBox = (await workPanel(page).boundingBox())!, next = (await nextButton(page, "work").boundingBox())!;
  expect(next.y + next.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
  await workPanel(page).evaluate((e) => { e.scrollTop = 0; });
  const nextAtTop = (await nextButton(page, "work").boundingBox())!;
  expect(nextAtTop.y + nextAtTop.height, "sticky: still inside the panel at the top").toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
  await workPanel(page).evaluate((e) => { e.scrollTop = 1e6; });
  // click from script: Playwright's own click scrolls the button into view, which would move the panel itself
  await tab(page, "work", "barracuda").evaluate((b: HTMLElement) => b.click());
  await expect(tab(page, "work", "barracuda")).toHaveAttribute("aria-current", "page");
  expect(await workPanel(page).evaluate((e) => e.scrollTop)).toBe(0);
});

// Leaving Work: the panel has more text than room and has been read to its end. Clicking Overview still leaves, and
// afterwards the wheel over where the panel was moves nothing: the camera stays at the overview.
test("leaving Work with a long panel works, and the wheel over the room then moves nothing", async ({ page }) => {
  test.setTimeout(90_000);
  await openWork(page, 1280, 800);
  await overflowPanel(page, "work"); // the real copy is too short to overflow, so the test makes it
  await workPanel(page).evaluate((e) => { e.scrollTop = 1e6; }); // read to the end first
  const box = (await workPanel(page).boundingBox())!;
  await goBack(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 }); // the pointer's parallax settles first
  const camera = await waitUntilStill(() => page.locator("canvas").first().getAttribute("data-camera"));
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 40); await page.waitForTimeout(75); }
  expect(await waitUntilStill(() => page.locator("canvas").first().getAttribute("data-camera")), "the camera did not move").toEqual(camera);
  expect(await page.evaluate(() => scrollY), "the page did not scroll").toBe(0);
  await landedAt(page, 0);
});

// Ticket 58, now on every station (#284): a page change plays the short flick on that station's glass only.
// Watches the panel's and the canvas's filter from inside the page; returns what it saw.
// `on`/`off` are when the panel's filter really went on and came off, `snaps` when the flick's snap back was visible
// (its displacement scale reaching 0), in ms from the watch's start.
type Seen = { on: number[]; off: number[]; snaps: number[]; canvas: number };
const watchFilters = async (page: Page, id = "work") => { await page.evaluate(defineSnapWatcher); await page.evaluate((id) => {
  const w = window as unknown as { __f: Seen };
  const panelEl = document.querySelector<HTMLElement>(`[data-screen="${id}"]`)!, canvas = document.querySelector("canvas")!;
  w.__f = { on: [], off: [], snaps: [], canvas: 0 };
  let on = false;
  const t0 = performance.now();
  new MutationObserver(() => {
    const now = panelEl.style.filter.includes("shift-tear");
    if (now && !on) w.__f.on.push(performance.now() - t0);
    if (!now && on) w.__f.off.push(performance.now() - t0);
    on = now;
  }).observe(panelEl, { attributes: true, attributeFilter: ["style"] });
  new MutationObserver(() => { if (canvas.style.filter.includes("shift-tear")) w.__f.canvas++; }).observe(canvas, { attributes: true, attributeFilter: ["style"] });
  window.__watchSnap("shift-tear-page", () => w.__f.snaps.push(performance.now() - t0));
}, id); };
const filters = (page: Page) => page.evaluate(() => (window as unknown as { __f: Seen }).__f);

/** The limit's window (1.1 s) and a little more, so a booked change has left it. */
const ARRIVAL_WINDOW_MS = 1_300;
/** Waits out the arrival's own tear, then starts watching the filters. */
async function settleAndWatch(page: Page, id: string) {
  // The first visit's tear is over once the canvas has no filter after having had one (its text, which waits for it, is already out).
  // A page turn books its flick against the limit of sudden changes in a window (WINDOW_MS in src/shift/shift.ts, 1.1 s from a
  // change), and the tear's changes still count in it: a click that comes sooner is turned with no flick, and this
  // helper's callers click at once. So wait out the window too, on the page's own clock.
  await expect.poll(() => page.evaluate((window_ms) => {
    const at = (window as unknown as { __tearAt: number | null }).__tearAt;
    return at !== null && performance.now() - at > window_ms && document.querySelector("canvas")!.style.filter === "";
  }, ARRIVAL_WINDOW_MS), { timeout: 10_000 }).toBe(true);
  await watchFilters(page, id);
}
/** Notes when the arrival's tear starts on the canvas (it starts after the desk meter's power-on, which on a slow
 *  machine is after the camera has arrived, so "no filter yet" does not mean "tear over"). */
const noteTear = (page: Page) => page.addInitScript(() => {
  const w = window as unknown as { __tearAt: number | null };
  w.__tearAt = null;
  new MutationObserver((records) => {
    for (const r of records) if (w.__tearAt === null && r.target instanceof HTMLCanvasElement && r.target.style.filter.includes("shift-tear")) w.__tearAt = performance.now();
  }).observe(document, { attributes: true, attributeFilter: ["style"], subtree: true });
});
async function openWorkWatched(page: Page) {
  await noteTear(page);
  await openWork(page, 1280, 800);
  await settleAndWatch(page, "work");
}
/** Waits until every flick that started has snapped back. */
const flicksOver = (page: Page) => expect.poll(async () => { const f = await filters(page); return f.on.length > 0 && f.off.length === f.on.length; }, { timeout: 10_000 }).toBe(true);
/** For checks that something did NOT happen: waits for the length of a flick plus a few drawn frames, counted on the page's own clock and frames, so a slow machine waits longer. */
const pastAFlick = (page: Page) => page.evaluate(([ms]) => new Promise<void>((res) => {
  const t0 = performance.now();
  let n = 0;
  const tick = () => (++n >= 5 && performance.now() - t0 > ms ? res() : requestAnimationFrame(tick));
  tick();
}), [SHIFT_SECONDS.short * 1000 + SNAP_BACK_MS] as const);

test("a page change flicks that station's glass only, and the page still changes", async ({ page }) => {
  test.setTimeout(60_000);
  await openWorkWatched(page);
  await tab(page, "work", "barracuda").click();
  await expect(tab(page, "work", "barracuda")).toHaveAttribute("aria-current", "page");
  expect(await shownText(page, "work")).toEqual(expect.arrayContaining(barracuda.body));
  await flicksOver(page);
  expect((await filters(page)).on).toHaveLength(1);
  expect((await filters(page)).canvas).toBe(0); // not the whole view
  expect(await workPanel(page).evaluate((e) => (e as HTMLElement).style.filter)).toBe(""); // and it ends
  expect(await page.locator("canvas").evaluate((e) => (e as HTMLElement).style.filter)).toBe("");
});

test("every way of changing the page flicks the glass: a Next button, a row, the → key", async ({ page }) => {
  test.setTimeout(90_000);
  await noteTear(page);
  await openStation(page, 2, "projects", { width: 1280, height: 800 });
  await settleAndWatch(page, "projects");
  await row(page, "projects", "software-factory").click(); // a row, on a station that is not Work
  await flicksOver(page);
  expect((await filters(page)).on).toHaveLength(1);
  await page.waitForTimeout(ARRIVAL_WINDOW_MS); // the flick's changes leave the limit's window
  await nextButton(page, "projects").click();
  await expect.poll(async () => (await filters(page)).on.length).toBe(2);
  await flicksOver(page);
  await page.waitForTimeout(ARRIVAL_WINDOW_MS);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await filters(page)).on.length).toBe(3);
  await flicksOver(page);
  expect((await filters(page)).canvas).toBe(0);
});

test("after a page change the scene draws no frames at rest", async ({ page }) => {
  test.setTimeout(60_000);
  await countDraws(page);
  await openWorkWatched(page);
  await tab(page, "work", "barracuda").click();
  await flicksOver(page);
  // The camera has been still since arriving, so anything drawn now would be the flick's doing. An absence
  // can't be waited for, so as idle.spec.ts does: let a few seconds pass and compare.
  await waitUntilStill(() => frames(page), 500); // a frame the page turn may have asked for has been drawn
  const before = { draws: await draws(page), frames: await frames(page) };
  await page.waitForTimeout(3_000);
  expect({ draws: await draws(page), frames: await frames(page) }).toEqual(before);
});

test("reduced motion swaps the page with no effect", async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  await openWork(page, 1280, 800);
  await watchFilters(page);
  await tab(page, "work", "barracuda").click();
  await expect(tab(page, "work", "barracuda")).toHaveAttribute("aria-current", "page");
  expect(await shownText(page, "work")).toEqual(expect.arrayContaining(barracuda.body));
  await pastAFlick(page);
  expect(await filters(page)).toEqual({ on: [], off: [], snaps: [], canvas: 0 });
});

// Clicks arrive at a set pace: the pause between them is the stimulus, not a wait for something.
const clickEvery = async (page: Page, ms: number, ids: string[]) => {
  for (const id of ids) {
    const t = Date.now();
    await tab(page, "work", id).click();
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - t)));
  }
};

test("clicking quickly back and forth ends on the right page and still flicks", async ({ page }) => {
  test.setTimeout(60_000);
  await openWorkWatched(page);
  await clickEvery(page, 60, ["barracuda", "solace", "barracuda", "solace", "barracuda", "solace", "barracuda"]);
  await expect(tab(page, "work", "barracuda")).toHaveAttribute("aria-current", "page");
  expect(await shownText(page, "work")).toEqual(expect.arrayContaining(barracuda.body));
  expect(await shownText(page, "work")).not.toContain(solace.body[0]);
  await flicksOver(page);
  const f = await filters(page);
  expect(f.on.length).toBeLessThan(7); // not one per click
  expect(f.canvas).toBe(0);
});

// The limit is on real changes: measured from when the filter goes on and when the snap back is visible (the displacement
// scale reaching 0, not the filter coming off, #124), with no shrunk window. 0.7 s is the pace that put 4 real changes in a
// second before the frame allowance; the window's edges are pinned with a fake clock in src/shift/shift.test.ts.
for (const every of [700]) {
  test(`clicking a tab every ${every} ms never puts more than 3 sudden changes in a real second`, { tag: "@timing" }, async ({ page }) => {
    test.setTimeout(60_000);
    await openWorkWatched(page);
    await clickEvery(page, every, Array.from({ length: 8 }, (_, k) => (k % 2 ? "solace" : "barracuda")));
    await flicksOver(page);
    const f = await filters(page);
    expect(f.on.length).toBeGreaterThan(1); // it flicks more than once
    expect(f.off.length).toBe(f.on.length);
    expect(f.snaps.length, "every flick's snap back was seen").toBe(f.on.length);
    expect(busiestWindow([...f.on, ...f.snaps])).toBeLessThanOrEqual(MAX_CHANGES_PER_SECOND);
    await expect(tab(page, "work", "solace")).toHaveAttribute("aria-current", "page"); // 8 clicks, ends on the last one
  });
}
