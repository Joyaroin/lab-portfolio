import { test, expect } from "@playwright/test";
import { goTo, openTour, panelOf, readDrawnCamera, stationIds, waitForPanel } from "./lib/page";
import { LAST_WATCHED_MAX, LAST_WATCHED_URL } from "../src/last-watched";

// #334, "The fold": a page's bullets fit on the glass, so the "more" cue doesn't show and nothing is hidden below the
// panel's bottom edge. Each page is opened at the three sizes below and checked twice: the cue (data-more) is not
// "true", and the panel itself has at most 4 px of text past its edge, the cue's own threshold (src/text/more.ts), down and sideways.
// Smaller windows hide more today and are out of scope. 1280x720 is the tightest: the type is at its 14 px floor.
const SIZES = [[1280, 720], [1440, 900], [1920, 1080]] as const;
const THRESHOLD_PX = 4; // markMore's: scrollHeight - clientHeight - scrollTop > 4 shows the cue

// #370: the answers Off the keyboard is checked with. Both are the longest title the read accepts (LAST_WATCHED_MAX code points): one of words,
// which would wrap if the line were let to, and one with no spaces, which would run off the side.
const WORDS = "Wide words ".repeat(8).slice(0, LAST_WATCHED_MAX).trim().padEnd(LAST_WATCHED_MAX, "W");
const NO_SPACES = "W".repeat(LAST_WATCHED_MAX);
const ANSWERS = { "longest title": WORDS, "longest title, no spaces": NO_SPACES };

type Entry = {
  station: string;
  page: string;
  /** A title the test serves as MediaSafe's answer (a fake, with page.route: no spec calls production MediaSafe) and waits to see as the
   *  Last watched line before it checks (#370). The page's own text is all the page has otherwise. */
  answer?: keyof typeof ANSWERS;
  /** A known failure: the page is skipped, with this as the reason, until its ticket removes the mark. */
  fixme?: string;
};

// Every page the spec covers is listed here, so a later ticket changes only its own entry.
const PAGES: Entry[] = [
  { station: "projects", page: "mediasafe" },
  // the Last watched line (#369, #370) with the longest title the read accepts, the golf photo (#342) and its caption
  { station: "about", page: "off-the-keyboard", answer: "longest title" },
  { station: "about", page: "off-the-keyboard", answer: "longest title, no spaces" },
  { station: "projects", page: "home-lab" },
];

for (const { station, page: pageId, answer, fixme } of PAGES) {
  for (const [width, height] of SIZES) {
    test(`${station} / ${pageId}${answer ? ` with the ${answer}` : ""} at ${width}x${height}: no "more" cue, and nothing past the panel's edge`, async ({ page }) => {
      test.fixme(fixme !== undefined, fixme);
      if (answer) {
        expect([...ANSWERS[answer]].length, "the longest title the read accepts").toBe(LAST_WATCHED_MAX);
        // the call is cross-origin: without the any-origin header and text/plain the line never shows and the checks below would pass for the wrong reason
        await page.route((u) => u.href === LAST_WATCHED_URL, (route) => route.fulfill({
          status: 200, body: ANSWERS[answer], headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "text/plain; charset=utf-8" },
        }));
      }
      await page.setViewportSize({ width, height });
      await openTour(page);
      await goTo(page, stationIds.indexOf(station) + 1);
      const panel = panelOf(page, station);
      // a page past the station's first is opened as a visitor does: its list row (Projects) or its tab (About me)
      await panel.locator(`[data-row="${pageId}"], [data-tabs] [data-page="${pageId}"]`).click();
      await expect(panel).toBeVisible();
      await waitForPanel(page, station);
      // every image in the panel has finished loading or failing: a late image changes the panel's height
      await expect.poll(() => panel.evaluate((p) => [...p.querySelectorAll("img")].every((i) => i.complete))).toBe(true);
      if (answer) await expect(panel.locator("[data-last-watched]")).toHaveText(`Last watched: ${ANSWERS[answer]}`);
      // the cue is worked out on each frame the room draws, and the room draws on demand: ask for one, wait for it
      await readDrawnCamera(page);
      await waitForPanel(page, station);
      await readDrawnCamera(page);
      const hidden = await panel.evaluate((p) => ({
        more: p.dataset.more, scrollTop: p.scrollTop, over: p.scrollHeight - p.clientHeight, side: p.scrollWidth - p.clientWidth,
        lineH: p.querySelector("[data-last-watched]")?.getBoundingClientRect().height ?? 0,
        lineHeight: parseFloat(getComputedStyle(p.querySelector("[data-last-watched]") ?? p).lineHeight),
      }));
      expect(hidden.scrollTop, "read at the panel's top").toBe(0);
      expect(hidden.more, "the cue").not.toBe("true");
      expect(hidden.over, "px of text past the panel's edge").toBeLessThanOrEqual(THRESHOLD_PX);
      expect(hidden.side, "px of text past the panel's right edge").toBeLessThanOrEqual(THRESHOLD_PX);
      if (answer) expect(hidden.lineH, "the Last watched line is one line high").toBeLessThanOrEqual(hidden.lineHeight + 1);
    });
  }
}
