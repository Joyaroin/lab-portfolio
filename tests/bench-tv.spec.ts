import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { crts, spares, type Crt } from "../src/crts";
import { glassBox } from "../src/glass";
import { framingFor } from "../src/framing";
import { stations, ui } from "../src/content";
import { landedAt, openTour, waitForCamera, waitForPanel } from "./lib/page";

// The bench TV is the Projects station (#282): at the overview a click on it flies to Projects, like a click on
// either other station's CRT. The three CRTs that are no station are spare CRTs: a click on one is a click on the
// room, which at the overview does nothing (no flight, no change to the URL). The HUD has a link for each of the
// three stations, besides Overview, and none for a spare CRT.

const size = { width: 1280, height: 800 };

/** The middle of `crt`'s glass in the window at the overview, as the tour's own camera sees it. */
function glassCentre(crt: Crt) {
  const s = framingFor(size).cameraAt({ kind: "at", stop: 0 });
  const cam = new PerspectiveCamera(s.fov, size.width / size.height, 0.01, 50);
  cam.position.set(...s.camera); cam.lookAt(new Vector3(...s.look)); cam.updateMatrixWorld();
  const b = glassBox(crt, cam, size);
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}

const hudLinks = (page: Page) => page.getByRole("navigation", { name: ui.hudLabel }).getByRole("link");
const projects = crts.find((c) => c.id === "projects")!;

test("the HUD has three station links plus Room, and none is a spare CRT's", async ({ page }) => {
  await page.setViewportSize(size);
  await openTour(page);
  const hrefs = await hudLinks(page).evaluateAll((as) => as.map((a) => a.getAttribute("href")).filter((h) => h?.startsWith("#") || h === "./"));
  expect(hrefs).toEqual(["./", ...stations.map((s) => `#${s.id}`)]);
  expect(hrefs).toEqual(["./", "#work", "#projects", "#about"]);
});

test("at the overview a click on the bench TV goes to Projects", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize(size);
  await openTour(page);
  await waitForCamera(page);
  const at = glassCentre(projects);
  expect(at.x > 0 && at.x < size.width && at.y > 0 && at.y < size.height, "the bench TV is in frame at the overview").toBe(true);
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName.toLowerCase(), [at.x, at.y])).toBe("canvas");
  await page.mouse.click(at.x, at.y);
  await landedAt(page, 2);
  expect(new URL(page.url()).hash).toBe("#projects");
  await waitForPanel(page, "projects");
  await expect(page.locator('[data-screen="projects"]')).toBeVisible();
});

test.describe("a spare CRT is lit glass and no more", () => {
  for (const spare of spares) {
    test(`at the overview a click on the ${spare.id} CRT leaves the URL alone`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize(size);
      await openTour(page);
      await waitForCamera(page);
      const at = glassCentre(spare);
      expect(at.x > 0 && at.x < size.width && at.y > 0 && at.y < size.height, `${spare.id} is in frame at the overview`).toBe(true);
      // the same click on a station's CRT flies there, so a click at this spot would show if the spare took one
      expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName.toLowerCase(), [at.x, at.y])).toBe("canvas");
      const before = page.url();
      await page.mouse.move(at.x, at.y);
      await page.waitForTimeout(500); // longer than the glow's ease: a spare shows no hover target and no pointer cursor
      expect(await page.locator("canvas").first().getAttribute("data-hover"), "no hover target").toBeNull();
      expect(await page.evaluate(() => document.body.style.cursor), "no pointer cursor").toBe("");
      await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(1200); // longer than a flight (0.9 s): nothing should be moving
      expect(page.url()).toBe(before);
      await landedAt(page, 0);
    });
  }
});
