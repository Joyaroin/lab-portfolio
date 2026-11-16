import { expect, test, type Page } from "@playwright/test";
import { stations, ui } from "../../src/content";

// Helpers the browser specs share. Specs that need a page to settle, scroll to a stop or read
// pixels use these, so there is one way of doing each.

/** Stations by id, in tour order. */
export const stationIds = stations.map((s) => s.id);

export const panelOf = (page: Page, id: string) => page.locator(`[data-screen="${id}"]`);

/** Loads the site and waits until the boot screen has gone. */
export async function openTour(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
}

// How a spec gets somewhere. A spec moves the way a visitor does: it clicks the HUD's links. These helpers
// are the one place that knows which link and what signal says the visitor has landed.

/** The HUD's link for `stop` (0 is Room, the overview). */
export const hudLink = (page: Page, stop: number) =>
  page.getByRole("navigation", { name: ui.hudLabel }).getByRole("link", { name: stop === 0 ? ui.room : stations[stop - 1].name, exact: true });

/** The meter bar's keys, by the word that names them in the content module. */
const KEY_NAMES = { prev: ui.prevStation, room: ui.backToRoom, next: ui.nextStation, start: ui.startTour };
/** A key on the meter bar, found as a visitor finds it: a button by its accessible name. */
export const barKey = (page: Page, key: keyof typeof KEY_NAMES) =>
  page.locator("[data-meter-bar]").getByRole("button", { name: KEY_NAMES[key], exact: true });

/** Resolves once the visitor has landed at `stop`: the HUD sets aria-current on its link then (not during a flight). */
export const landedAt = (page: Page, stop: number) => expect(hudLink(page, stop)).toHaveAttribute("aria-current", "location");

/** Clicks `stop`'s HUD link (0 is Room) without waiting for the flight. */
export const clickLink = (page: Page, stop: number) => hudLink(page, stop).click();

/** The HUD link's href for `stop`: Room's is "./", a station's its #id. */
export const hudHref = (stop: number) => (stop === 0 ? "./" : `#${stations[stop - 1].id}`);

/** For specs that move inside the page, where Playwright's own click is too slow or too late: install it with
 *  `page.addInitScript(defineHudDriver)` and call `window.__hudGo(hudHref(stop))` in the page. It clicks that HUD
 *  link and resolves with `performance.now()` at the landing (the link's aria-current), the same signal `goTo` waits for.
 *  It runs in the browser, so it uses nothing from this file. */
export function defineHudDriver() {
  (window as unknown as { __hudGo: (href: string) => Promise<number> }).__hudGo = (href) => new Promise<number>((res) => {
    const nav = document.querySelector('nav[aria-label="HUD"]')!;
    const link = nav.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)!;
    const current = () => link.getAttribute("aria-current") === "location";
    const mo = new MutationObserver(() => { if (current()) { mo.disconnect(); res(performance.now()); } });
    mo.observe(nav, { attributes: true, subtree: true, attributeFilter: ["aria-current"] });
    if (current()) { mo.disconnect(); res(performance.now()); } else link.click();
  });
}

/** Goes to `stop` (0 is the overview) through the HUD, and resolves once the visitor has landed there. */
export async function goTo(page: Page, stop: number) {
  await clickLink(page, stop);
  await landedAt(page, stop);
}

/** Goes back to the overview: clicks Room and waits for its aria-current. */
export const goBack = (page: Page) => goTo(page, 0);

/** Leaves a station for the overview: clicks Room. */
export const leave = (page: Page) => goTo(page, 0);

/** The longest `waitUntilStill` waits for things to stop moving: three times the 15 s `expect` limit,
 *  because on a slow runner (software WebGL, a host under load) the camera eases in far fewer frames
 *  and one 1920x1080 wheel test timed out at 15 s once. It is a ceiling, not a delay: it only costs
 *  anything when something never settles, and then it still fails, with the last values it read. */
export const STILL_LIMIT_MS = 45_000;

/** Time to leave the test itself after the poll gives up, so the poll's failure (with its last
 *  values) is what gets reported and not the test's plain timeout. */
const TEST_MARGIN_MS = 3_000;

/** How long a poll may run in the test that is running: the limit, or the test's timeout less a margin,
 *  whichever is shorter. A test left at Playwright's 30 s default would otherwise time out first, with
 *  a plain timeout and not what the poll last read. This counts the test's whole timeout, not what is
 *  left of it (TestInfo has no start time to subtract). If a test has already used most of its time when
 *  the poll starts, Playwright cuts the poll off at the test's deadline instead. */
function pollBudget(limit: number) {
  try {
    const { timeout } = test.info();
    if (timeout > 0) return Math.max(1, Math.min(limit, timeout - TEST_MARGIN_MS));
  } catch { /* outside a test: no test clock to respect */ }
  return limit;
}

/** Waits until `read()` returns the same thing twice, `every` ms apart, and fails if it hasn't
 *  within `timeout` ms (at most `STILL_LIMIT_MS`, and always before the test's own timeout). The
 *  failure shows the last value read. The scene is only drawn on demand and eases toward its target,
 *  so "the same twice" means arrived only if each read comes after a drawn frame: for the camera use `waitForCamera`. */
export async function waitUntilStill<T>(read: () => Promise<T>, every = 300, timeout = STILL_LIMIT_MS) {
  let last: string | undefined;
  await expect.poll(async () => {
    const now = JSON.stringify(await read());
    const still = now === last;
    last = now;
    return still ? "still" : `still moving, last read ${now}`;
  }, { intervals: [every], timeout: pollBudget(timeout) }).toBe("still");
  return JSON.parse(last!) as T;
}

/** The camera's position, from the canvas's data-camera. Fails if the attribute is missing or
 *  isn't three numbers, so a page that never wrote one can't pass as "the camera is at zero". */
export async function readCamera(page: Page): Promise<number[]> {
  const raw = await page.locator("canvas").first().getAttribute("data-camera");
  expect(raw, "the canvas writes data-camera").toBeTruthy();
  const v = raw!.split(",").map(Number);
  expect(v, `data-camera "${raw}" is three numbers`).toHaveLength(3);
  for (const n of v) expect(Number.isFinite(n), `data-camera "${raw}"`).toBe(true);
  return v;
}

/** How long `readDrawnCamera` waits for the scene to draw the frame it asked for. A draw on software WebGL under load takes
 *  seconds at worst; a page that never draws one is hung, and fails with that said. */
const FRAME_LIMIT_MS = 20_000;

/** Asks the scene for a frame, waits until it has been drawn, then reads the camera.
 *  data-camera is written once per drawn frame, and the scene draws on demand, so a plain read can't tell a camera at
 *  rest from one that is easing but whose next frame hasn't come (slow frames under load): both read the same twice.
 *  A frame drawn at rest leaves the camera where it was; a frame drawn mid-ease moves it. So a read taken after a frame
 *  that was asked for tells the two apart. The ask is a `pointermove` on `window`, which only the room's own redraw hears:
 *  it carries no pointer position, so it moves no parallax. */
export async function readDrawnCamera(page: Page): Promise<number[]> {
  await page.locator("canvas").first().evaluate((canvas, limit) => new Promise<void>((res, rej) => {
    const timer = setTimeout(() => { mo.disconnect(); rej(new Error(`no frame was drawn within ${limit} ms of asking for one`)); }, limit);
    const mo = new MutationObserver(() => { clearTimeout(timer); mo.disconnect(); res(); });
    mo.observe(canvas, { attributes: true, attributeFilter: ["data-camera"] }); // fires on every write, changed or not
    window.dispatchEvent(new Event("pointermove"));
  }), FRAME_LIMIT_MS);
  return readCamera(page);
}

/** Waits for the camera to stop moving, and returns where it stopped. Each read follows a frame the scene was asked to
 *  draw (`readDrawnCamera`), so two equal reads mean the camera is at rest, not that frames were slow. */
export const waitForCamera = (page: Page, every = 300) => waitUntilStill(() => readDrawnCamera(page), every);

/** A panel's box in window pixels. */
export const boxOf = (page: Page, id: string) => panelOf(page, id).evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
});

/** Waits for a panel to stop moving (the camera easing into the stop), and returns its box. */
export const waitForPanel = (page: Page, id: string, every = 400) => waitUntilStill(() => boxOf(page, id), every);

/** Hands a screenshot to `fn` inside the page, as decoded pixels, and returns what it returns.
 *  `fn` runs in the browser, so it can't use anything from the spec's own scope; pass what it needs
 *  as `arg`. This is the one place that decodes a screenshot. */
export function readShot<A, R>(page: Page, png: Buffer, fn: (img: ImageData, arg: A) => R, arg: A): Promise<R> {
  return page.evaluate(async ({ src, fnSrc, arg }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d")!;
    x.drawImage(img, 0, 0);
    return (0, eval)(`(${fnSrc})`)(x.getImageData(0, 0, c.width, c.height), arg);
  }, { src: "data:image/png;base64," + png.toString("base64"), fnSrc: fn.toString(), arg });
}

/** Mean brightness (0-255) of a screenshot. */
export const meanBrightness = (page: Page, png: Buffer) => readShot(page, png, (img) => {
  const d = img.data;
  let sum = 0;
  for (let k = 0; k < d.length; k += 4) sum += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
  return sum / (d.length / 4);
}, null);

// Counts the 3D scene's draw calls, which is what a drawn frame is made of. Headless Chromium has
// software WebGL, so this proves the scene is idle, not how much a phone would spend drawing.
// Nothing on the CRTs moves, so every draw is the power-on, a flight or a pointer move.
export const countDraws = async (page: Page) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __draws: number; __frames: number };
    w.__draws = 0;
    w.__frames = 0; // each frame clears the screen once
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const clear = C.prototype.clear;
      C.prototype.clear = function (mask: number) { w.__frames++; return clear.call(this, mask); };
    }
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      for (const fn of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"] as const) {
        const orig = (C.prototype as any)[fn];
        (C.prototype as any)[fn] = function (...a: unknown[]) { w.__draws++; return orig.apply(this, a); };
      }
    }
  });
};
export const draws = (page: Page) => page.evaluate(() => (window as unknown as { __draws: number }).__draws);
export const frames = (page: Page) => page.evaluate(() => (window as unknown as { __frames: number }).__frames);


/** Makes a panel overflow, whatever its copy says: appends filler paragraphs until its text is
 *  `times` boxes tall (2 = one box of scrolling), then waits for the panel to settle. */
export async function overflowPanel(page: Page, id: string, times = 2) {
  await panelOf(page, id).evaluate((e, times) => {
    const clientHeight = e.clientHeight;
    while (e.scrollHeight < clientHeight * times) {
      const p = document.createElement("p");
      p.textContent = "Filler paragraph added by the test so that this panel runs past its bottom edge. ".repeat(4);
      e.insertBefore(p, e.querySelector(".crt-more"));
    }
  }, times);
  await waitForPanel(page, id);
}
