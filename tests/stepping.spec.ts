import { test, expect, type Page } from "@playwright/test";
import { fill, stations, stopLineText, ui } from "../src/content";
import { formatReading } from "../src/gap";
import { stopForHash } from "../src/visit/route";
import { barKey, goTo, landedAt, openTour, stationIds } from "./lib/page";

// The meter bar's keys and the arrow keys (#223, pages #283): PREV, ROOM, NEXT and START step the visitor through the
// pages of the stations (Work has 2, Projects 4, About me 3), one page a press.
// Each waits for the HUD link's aria-current (set at a landing) and reads the URL's hash for where the visitor is.
// A move is a quick fade, so the specs run under reduced motion.

const stopOf = (id: string) => stationIds.indexOf(id) + 1;
const WORK = stopOf("work"), PROJECTS = stopOf("projects"), ABOUT = stopOf("about");

const hashOf = (page: Page) => new URL(page.url()).hash;
const waitHash = (page: Page, hash: string) => expect.poll(() => hashOf(page)).toBe(hash);
const press = async (page: Page, key: "next" | "prev", times = 1) => { for (let i = 0; i < times; i++) await barKey(page, key).click(); };
const right = async (page: Page, times = 1) => { for (let i = 0; i < times; i++) await page.keyboard.press("ArrowRight"); };

/** The stop the URL names: 0 for the overview. */
const urlStop = (page: Page) => stopForHash(new URL(page.url()).hash);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openTour(page);
  await landedAt(page, 0);
});

test.describe("the keys", () => {
  test("NEXT at Work goes to Work's second page, then to Projects' list", async ({ page }) => {
    await goTo(page, WORK);
    await barKey(page, "next").click();
    await waitHash(page, "#work/barracuda");
    await landedAt(page, WORK);
    await barKey(page, "next").click();
    await landedAt(page, PROJECTS);
    expect(hashOf(page)).toBe("#projects");
  });

  test("NEXT walks every page of Projects, then About me", async ({ page }) => {
    await goTo(page, PROJECTS);
    for (const hash of ["#projects/software-factory", "#projects/mediasafe", "#projects/home-lab"]) {
      await barKey(page, "next").click();
      await waitHash(page, hash);
      await landedAt(page, PROJECTS);
    }
    await barKey(page, "next").click();
    await landedAt(page, ABOUT);
    expect(hashOf(page)).toBe("#about");
  });

  test("PREV at Work goes to the overview", async ({ page }) => {
    await goTo(page, WORK);
    await barKey(page, "prev").click();
    await landedAt(page, 0);
    expect(urlStop(page)).toBe(0);
  });

  test("PREV at Projects' list goes to Work's last page, and from there to its first", async ({ page }) => {
    await goTo(page, PROJECTS);
    await barKey(page, "prev").click();
    await landedAt(page, WORK);
    await waitHash(page, "#work/barracuda");
    await barKey(page, "prev").click();
    await waitHash(page, "#work");
  });

  test("ROOM at any station goes to the overview", async ({ page }) => {
    for (let stop = 1; stop <= stations.length; stop++) {
      await goTo(page, stop);
      await barKey(page, "room").click();
      await landedAt(page, 0);
      expect(urlStop(page), `ROOM at station ${stop}`).toBe(0);
    }
  });

  test("START at the overview goes to Work", async ({ page }) => {
    await barKey(page, "start").click();
    await landedAt(page, WORK);
    expect(new URL(page.url()).hash).toBe("#work");
  });

  test("NEXT at About me walks its three pages, then goes to the overview", async ({ page }) => {
    await goTo(page, ABOUT);
    await press(page, "next", 2);
    await waitHash(page, "#about/contact");
    await landedAt(page, ABOUT);
    await press(page, "next");
    await landedAt(page, 0);
    expect(urlStop(page)).toBe(0);
  });

  test("the bar's line names the station, the page and the station's number, from the content module, and follows a page move", async ({ page }) => {
    await goTo(page, PROJECTS);
    const s = stations[PROJECTS - 1];
    const bar = page.locator("[data-meter-bar]");
    const reading = page.getByRole("img", { name: fill(ui.meterReading, { digits: formatReading(s.reading) }) });
    await expect(bar.getByText(stopLineText(s, s.pages[0], PROJECTS, stations.length), { exact: true })).toBeVisible(); // "Projects · 2 of 3"
    await expect(reading).toBeVisible();
    await barKey(page, "next").click();
    await expect(bar.getByText(stopLineText(s, s.pages[1], PROJECTS, stations.length), { exact: true })).toBeVisible(); // "Projects · Software factory · 2 of 3"
    await expect(reading, "a page move does not change the reading").toBeVisible();
  });
});

test.describe("the arrow keys", () => {
  test("Right at Work goes through Work's two pages to Projects, Left goes back", async ({ page }) => {
    await goTo(page, WORK);
    await right(page);
    await waitHash(page, "#work/barracuda");
    await right(page);
    await landedAt(page, PROJECTS);
    expect(hashOf(page)).toBe("#projects");
    await page.keyboard.press("ArrowLeft");
    await landedAt(page, WORK);
    await waitHash(page, "#work/barracuda");
  });

  test("Esc on a project page goes to the Projects list, and from the list to the overview", async ({ page }) => {
    await page.goto("/#projects/mediasafe");
    await expect(page.getByLabel("Boot log")).toBeHidden();
    await landedAt(page, PROJECTS);
    await page.keyboard.press("Escape");
    await waitHash(page, "#projects");
    await landedAt(page, PROJECTS);
    await page.keyboard.press("Escape");
    await landedAt(page, 0);
    expect(urlStop(page)).toBe(0);
  });

  // A plain functional check (untagged): the flash-limit @timing test for holding → is #284's. Holding sends keydowns with
  // no keyup between, as a held key repeats; a press during a fade is held and applied when it lands.
  test("holding Right across a page and a station boundary ends where the presses lead", async ({ page }) => {
    await goTo(page, WORK);
    for (let i = 0; i < 3; i++) await page.keyboard.down("ArrowRight"); // Barracuda, then Projects, then its first project
    await page.keyboard.up("ArrowRight");
    await landedAt(page, PROJECTS);
    await waitHash(page, "#projects/software-factory");
    for (let i = 0; i < 4; i++) await page.keyboard.down("ArrowRight"); // MediaSafe, Home lab, About me, Off the keyboard
    await page.keyboard.up("ArrowRight");
    await landedAt(page, ABOUT);
    await waitHash(page, "#about/off-the-keyboard");
  });

  test("Left at Work's first page goes to the overview", async ({ page }) => {
    await goTo(page, WORK);
    await page.keyboard.press("ArrowLeft");
    await landedAt(page, 0);
  });

  test("Right through About me's three pages goes to the overview", async ({ page }) => {
    await goTo(page, ABOUT);
    await right(page, 2);
    await waitHash(page, "#about/contact");
    await right(page);
    await landedAt(page, 0);
  });

  test("Right at the overview goes to Work", async ({ page }) => {
    await page.keyboard.press("ArrowRight");
    await landedAt(page, WORK);
    expect(new URL(page.url()).hash).toBe("#work");
  });

  test("Left at the overview does nothing", async ({ page }) => {
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(800); // longer than a fade
    await landedAt(page, 0);
    expect(urlStop(page)).toBe(0);
  });

  test("Ctrl+Right is ignored", async ({ page }) => {
    await page.keyboard.press("Control+ArrowRight");
    await page.waitForTimeout(800);
    await landedAt(page, 0);
    expect(urlStop(page)).toBe(0);
    await goTo(page, PROJECTS);
    await page.keyboard.press("Control+ArrowRight");
    await page.keyboard.press("Alt+ArrowLeft");
    await page.waitForTimeout(800);
    await landedAt(page, PROJECTS);
  });
});

for (const [name, size, atStation] of [
  ["1440 x 900", { width: 1440, height: 900 }, ["prev", "room", "next"]],
  ["390 x 844", { width: 390, height: 844 }, ["prev", "next"]],
] as const) {
  test(`each key is a button with its accessible name, at least 44 x 44 px (${name})`, async ({ page }) => {
    await page.setViewportSize(size);
    const names = { prev: ui.prevStation, room: ui.backToRoom, next: ui.nextStation, start: ui.startTour };
    const caps = { prev: ui.keyPrev, room: ui.keyRoom, next: ui.keyNext, start: ui.keyStart };
    const check = async (keys: readonly (keyof typeof names)[]) => {
      await expect(page.locator("[data-meter-bar]").getByRole("button")).toHaveCount(keys.length);
      for (const k of keys) {
        const key = page.getByRole("button", { name: names[k], exact: true });
        await expect(key).toBeVisible();
        await expect(key).toHaveText(caps[k]);
        const box = (await key.boundingBox())!;
        expect(box.width, `${k} width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${k} height`).toBeGreaterThanOrEqual(44);
        expect(box.x, `${k} is on screen`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${k} is on screen`).toBeLessThanOrEqual(size.width);
        expect(box.y + box.height, `${k} is on screen`).toBeLessThanOrEqual(size.height);
      }
    };
    await check(["start"]); // the overview
    await goTo(page, PROJECTS);
    await check(atStation);
  });
}

// The Start button stands above the bar, so the bar's keys and line grow it upward and the button must clear it.
// The window is set before the page loads, not by resizing the open one (#314): the app reads the new size on its resize
// event, which can arrive after `setViewportSize` returns, and until then the Start button is placed for the old window
// while the bar's line wraps at the new one. That left the button 10 px over the bar (1440 x 900 clearances, 390 px wide line).
for (const [name, size] of [["1440 x 900", { width: 1440, height: 900 }], ["390 x 844", { width: 390, height: 844 }]] as const) {
  test(`at the overview the Start button is clear of the bar (${name})`, async ({ page }) => {
    await page.setViewportSize(size);
    await openTour(page);
    await expect(page.locator("[data-device]")).toBeVisible();
    const start = (await page.locator("[data-start]").boundingBox())!;
    const bar = (await page.locator("[data-meter-bar]").boundingBox())!;
    expect(start.y + start.height, `the Start button's box ends above the bar (${bar.y})`).toBeLessThanOrEqual(bar.y);
  });
}

test.describe("the bar itself", () => {
  test("a click on the bar outside its keys moves nothing", async ({ page }) => {
    const bar = page.locator("[data-meter-bar]");
    await bar.click({ position: { x: 3, y: 3 } });
    await page.waitForTimeout(800);
    await landedAt(page, 0);
    expect(urlStop(page)).toBe(0);
    await goTo(page, PROJECTS);
    await bar.click({ position: { x: 3, y: 3 } });
    await page.getByRole("img", { name: /^Reading/ }).click(); // the reading is not a key either
    await page.waitForTimeout(800);
    await landedAt(page, PROJECTS);
    expect(urlStop(page)).toBe(PROJECTS);
  });

  test("the reading is found by its label, and at the overview its digits are visible", async ({ page }) => {
    const reading = page.getByRole("img", { name: /^Reading/ });
    await expect(reading).toHaveAttribute("aria-label", /^Reading \d/);
    await expect(reading).toBeVisible();
    await expect(reading.getByTestId("tube").first()).toBeVisible();
    const box = (await reading.boundingBox())!;
    expect(box.width).toBeGreaterThan(20);
    expect(box.height).toBeGreaterThan(10);
  });
});
