import { test, expect } from "@playwright/test";
import { goTo, openTour, panelOf, readDrawnCamera, stationIds, waitForPanel } from "./lib/page";

// #334, "The fold": a page's bullets fit on the glass, so the "more" cue doesn't show and nothing is hidden below the
// panel's bottom edge. Each page is opened at the three sizes below and checked twice: the cue (data-more) is not
// "true", and the panel itself has at most 4 px of text past its edge, the cue's own threshold (src/text/more.ts).
// Smaller windows hide more today and are out of scope. 1280x720 is the tightest: the type is at its 14 px floor.
const SIZES = [[1280, 720], [1440, 900], [1920, 1080]] as const;
const THRESHOLD_PX = 4; // markMore's: scrollHeight - clientHeight - scrollTop > 4 shows the cue

type Entry = {
  station: string;
  page: string;
  /** Lines of text the test adds under the page's bullets before it checks: a way to prove a spare line fits (#342), or,
   *  with enough of them, to break the check and see the cue appear. */
  extraLines?: number;
  /** A known failure: the page is skipped, with this as the reason, until its ticket removes the mark. */
  fixme?: string;
};

// Every page the spec covers is listed here, so a later ticket changes only its own entry.
const PAGES: Entry[] = [
  { station: "projects", page: "mediasafe" },
  { station: "about", page: "off-the-keyboard" },
  // Home lab still hides text at 1280x720 until #343 rewrites it. #343 removes this mark.
  { station: "projects", page: "home-lab", fixme: "Home lab's copy is too tall for the glass until #343" },
];

for (const { station, page: pageId, extraLines = 0, fixme } of PAGES) {
  for (const [width, height] of SIZES) {
    test(`${station} / ${pageId} at ${width}x${height}: no "more" cue, and nothing past the panel's edge`, async ({ page }) => {
      test.fixme(fixme !== undefined, fixme);
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
      if (extraLines > 0) {
        await panel.evaluate((p, n) => {
          const list = p.querySelector("ul:not([data-list] ul)")!;
          const last = list.lastElementChild!;
          for (let i = 0; i < n; i++) {
            const line = last.cloneNode(false) as HTMLElement;
            line.textContent = "A line the test added.";
            list.append(line);
          }
        }, extraLines);
      }
      // the cue is worked out on each frame the room draws, and the room draws on demand: ask for one, wait for it
      await readDrawnCamera(page);
      await waitForPanel(page, station);
      await readDrawnCamera(page);
      const hidden = await panel.evaluate((p) => ({ more: p.dataset.more, scrollTop: p.scrollTop, over: p.scrollHeight - p.clientHeight }));
      expect(hidden.scrollTop, "read at the panel's top").toBe(0);
      expect(hidden.more, "the cue").not.toBe("true");
      expect(hidden.over, "px of text past the panel's edge").toBeLessThanOrEqual(THRESHOLD_PX);
    });
  }
}
