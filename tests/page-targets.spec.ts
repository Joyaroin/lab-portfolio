import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { framingFor } from "../src/framing";
import { pageTargets, targetFrame } from "../src/page-targets";
import { startBox } from "../src/pin";
import { ui } from "../src/content";
import { goTo, landedAt, openTour, readDrawnCamera, waitForCamera } from "./lib/page";

// The rack and the desk phone as clicks (#386): at the landscape overview, from 1280 x 720 up, a click on the rack lands on Projects / Home lab and a click on
// the desk phone on About me / Contact; at a station the same press is a press on the room and goes back; under the gate neither does anything.
// The gate, the rule for when a press goes where and the sizes and clearances are unit tests (src/page-targets.test.ts); this is the real press.

type Win = { width: number; height: number };
const [rack, phone] = pageTargets.map((t) => t.prop.id);
const HASH: Record<string, string> = { rack: "#projects/home-lab", "desk-phone-target": "#about/contact" };
const TITLE: Record<string, RegExp> = { rack: /^Home lab · Projects/, "desk-phone-target": /^Contact · About me/ };
const by = (id: string) => pageTargets.find((t) => t.prop.id === id)!.prop;

/** Where the middle of a target's plane is in the window, as a camera at `camera` (the pose's `look` and field of view) sees it; null behind the camera. */
function centreAt(id: string, win: Win, pose: { camera: [number, number, number]; look: [number, number, number]; fov: number }) {
  const cam = new PerspectiveCamera(pose.fov, win.width / win.height, 0.01, 50);
  cam.position.set(...pose.camera); cam.lookAt(new Vector3(...pose.look)); cam.updateMatrixWorld();
  const p = new Vector3(...targetFrame(by(id)).position).project(cam);
  return p.z > 1 ? null : { x: (p.x * 0.5 + 0.5) * win.width, y: (-p.y * 0.5 + 0.5) * win.height };
}

/** The window point over target `id` at the camera's pose of the moment: the pointer moves the camera a little (the mouse parallax), so the pointer is moved
 *  there, the camera is waited for and the point worked out again, until it holds still under the pointer. */
async function pointOver(page: Page, id: string, stop: number) {
  const win = page.viewportSize()!, rest = framingFor(win).cameraAt({ kind: "at", stop });
  let at = centreAt(id, win, rest)!;
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(at.x, at.y);
    await waitForCamera(page);
    const camera = (await readDrawnCamera(page)) as [number, number, number];
    const next = centreAt(id, win, { ...rest, camera })!;
    if (Math.hypot(next.x - at.x, next.y - at.y) < 1.5) return next;
    at = next;
  }
  return at;
}

/** What the page's top element is at a point: "canvas" when it is the room. */
const topAt = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName.toLowerCase() ?? "none", [x, y]);
const hash = (page: Page) => page.evaluate(() => location.hash);

/** The visitor is still at the overview with the URL unchanged, a while after a click that must do nothing (longer than a flight). */
async function staysAtOverview(page: Page) {
  await page.waitForTimeout(1500);
  await landedAt(page, 0);
  expect(await hash(page)).toBe("");
}

test.describe("at the overview, 1280 x 720", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  for (const id of [rack, phone]) {
    test(`a click on ${id === rack ? "the rack" : "the desk phone"} lands on ${id === rack ? "Home lab" : "Contact"}`, async ({ page }) => {
      await openTour(page);
      await landedAt(page, 0);
      const at = await pointOver(page, id, 0);
      expect(await topAt(page, at.x, at.y), "the target is under the canvas, not under the HUD or the Start button").toBe("canvas");
      await page.mouse.click(at.x, at.y);
      await landedAt(page, id === rack ? 2 : 3);
      await expect.poll(() => hash(page)).toBe(HASH[id]);
      await expect(page).toHaveTitle(TITLE[id]);
    });
  }

  // The rack can't be pressed from a station: from every stop it is far outside the window (or behind the camera), so there is no press to make with it, and the
  // same point of the window at a station is the station's own TV or its text. The desk phone's point, low at the left, is the bare room from a station.
  test("at a station, the press that visits Contact at the overview (the same point of the window, on the desk phone) is a press on the room and goes back", async ({ page }) => {
    await openTour(page);
    await landedAt(page, 0);
    const at = await pointOver(page, phone, 0);
    let went = false;
    for (let stop = 1; stop <= 3 && !went; stop++) {
      await goTo(page, stop);
      await waitForCamera(page);
      if (await topAt(page, at.x, at.y) !== "canvas") continue; // the station's text is there
      await page.mouse.click(at.x, at.y);
      await landedAt(page, 0);
      expect(await hash(page), "the URL is the overview's").toBe("");
      went = true;
    }
    expect(went, "the point is the bare room from one of the stations").toBe(true);
  });
});

// The hover (#387): while the pointer rests on either at the overview the cursor is a pointer and the line under the meter says where the click goes. The digits
// never change, and there is no glow. Touch and focus get no preview. The timing (the line at once) is src/bar.test.ts's; this is the real pointer.
const barLine = (page: Page) => page.locator("[data-meter-bar] > span[data-live]");
const digits = (page: Page) => page.locator("[data-meter-bar] [role=img]").getAttribute("aria-label");
const cursor = (page: Page) => page.evaluate(() => document.body.style.cursor);
const WORDS: Record<string, string> = { rack: "Home lab", "desk-phone-target": "Contact" };

test.describe("the hover at the overview, 1280 x 720", () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test.beforeEach(async ({ page }) => {
    await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 403, json: {} }));
    await openTour(page);
    await landedAt(page, 0);
    await waitForCamera(page);
    await expect(barLine(page)).not.toHaveText(ui.readingPending);
  });

  for (const id of [rack, phone]) {
    test(`the pointer on ${id === rack ? "the rack" : "the desk phone"} sets the pointer cursor and names ${WORDS[id]} under the meter, with the digits and glow unchanged; leaving clears it`, async ({ page }) => {
      const gapLine = (await barLine(page).textContent())!, gapDigits = await digits(page);
      expect(gapLine).not.toBe(WORDS[id]);
      const at = await pointOver(page, id, 0);
      await expect(barLine(page)).toHaveText(WORDS[id]);
      await expect.poll(() => cursor(page)).toBe("pointer");
      await expect(page.locator("canvas").first()).toHaveAttribute("data-hover", id);
      await page.waitForTimeout(600); // past the digits' rest (150 ms) and the glow's ease
      expect(await digits(page), "the digits stay the gap's").toBe(gapDigits);
      await expect(page.locator("canvas").first(), "no glow").not.toHaveAttribute("data-lit", /.*/);
      await page.mouse.move(at.x, 2);
      await expect(barLine(page)).toHaveText(gapLine);
      await expect.poll(() => cursor(page)).toBe("");
    });
  }

  test("the pointer going from the rack to the desk phone changes the line from Home lab to Contact", async ({ page }) => {
    await pointOver(page, rack, 0);
    await expect(barLine(page)).toHaveText(WORDS[rack]);
    await pointOver(page, phone, 0);
    await expect(barLine(page)).toHaveText(WORDS[phone]);
  });
});

test.describe("a touch at the overview, 1280 x 720", () => {
  test.use({ viewport: { width: 1280, height: 720 }, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 403, json: {} }));
    await openTour(page);
    await landedAt(page, 0);
    await waitForCamera(page);
    await expect(barLine(page)).not.toHaveText(ui.readingPending);
  });

  test("a touch held on either shows no line", async ({ page }) => {
    const gapLine = (await barLine(page).textContent())!;
    const cdp = await page.context().newCDPSession(page);
    for (const id of [rack, phone]) {
      const at = await pointOver(page, id, 0);
      await page.mouse.move(at.x, 2);
      await expect(barLine(page)).toHaveText(gapLine);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at.x, y: at.y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: at.x + 2, y: at.y + 2 }] }); // the room hears a pointer over only from a move
      await page.waitForTimeout(500); // the touch is held: the pointer is over the target, and no click has happened yet
      expect(await cursor(page), "the touch is over the target (the cursor is the TV's rule, a touch included)").toBe("pointer");
      await expect(barLine(page), `a touch on ${id}`).toHaveText(gapLine);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    }
  });
});

// Under the gate neither is a click: a window just under 1280 wide or 720 tall, and 1024 x 768. (A portrait window has no press to make: at 390 x 844 and 820 x 1180 the middle of neither prop is inside the window. That the gate is off there is a unit test.)
for (const [width, height] of [[1279, 720], [1280, 719], [1024, 768]]) {
  test.describe(`${width} x ${height}, under the gate`, () => {
    test.use({ viewport: { width, height } });
    for (const id of [rack, phone]) {
      test(`a click on ${id === rack ? "the rack" : "the desk phone"} does nothing`, async ({ page }) => {
        await openTour(page);
        await landedAt(page, 0);
        const at = await pointOver(page, id, 0);
        expect(at.x > 0 && at.x < width && at.y > 0 && at.y < height, "the target's place is in the window").toBe(true);
        expect(await topAt(page, at.x, at.y)).toBe("canvas");
        await page.mouse.click(at.x, at.y);
        await staysAtOverview(page);
      });
      test(`the pointer on ${id === rack ? "the rack" : "the desk phone"} shows no line and no pointer cursor`, async ({ page }) => {
        await openTour(page);
        await landedAt(page, 0);
        await pointOver(page, id, 0);
        await page.waitForTimeout(600);
        expect(await cursor(page)).toBe("");
        await expect(barLine(page)).not.toHaveText(WORDS[id]);
      });
    }
  });
}

// The Start button's box is a rule of the window (src/pin.ts), and the real button with the line under it stands inside it.
for (const [width, height] of [[1280, 720], [1920, 1080], [2560, 1440]]) {
  test(`${width} x ${height}: the Start button and the line under it are inside startBox, which is no more than 14 px wider`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openTour(page);
    const real = (await page.locator("[data-start]").evaluate((el) => {
      const rects = [...el.children].map((c) => c.getBoundingClientRect());
      const left = Math.min(...rects.map((r) => r.left)), top = Math.min(...rects.map((r) => r.top));
      return { left, top, width: Math.max(...rects.map((r) => r.right)) - left, height: Math.max(...rects.map((r) => r.bottom)) - top };
    }));
    const rule = startBox({ width, height });
    expect(real.left, "left edge").toBeGreaterThanOrEqual(rule.left - 0.5);
    expect(real.left + real.width, "right edge").toBeLessThanOrEqual(rule.left + rule.width + 0.5);
    expect(real.top, "top edge").toBeGreaterThanOrEqual(rule.top - 0.5);
    expect(real.top + real.height, "bottom edge").toBeCloseTo(rule.top + rule.height, 0);
    expect(rule.width - real.width, "the rule's slack").toBeLessThanOrEqual(14);
    expect(rule.height - real.height, "the rule's height").toBeLessThanOrEqual(1);
  });
}
