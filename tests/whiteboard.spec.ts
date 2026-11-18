import { test, expect, type Browser, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { props } from "../src/crts";
import { framingFor } from "../src/framing";

// The whiteboard's topology (#385) is drawn over the blank board, once, at every stop in both framings. This looks at the pixels the page
// really drew where the board is: from the tour's own camera it projects the board's corners (the `whiteboard` entry of room-layout.json),
// and checks the board's middle holds ink-coloured pixels, which a blank board (green, baked) doesn't.
// Screenshots go to test-results/ for the PR's contact sheet.
// A break check: leave <Whiteboard /> out of src/Room.tsx and the landscape test fails.

const board = props.find((p) => p.kind === "board")!;
const LANDSCAPE = { width: 1280, height: 720 };
const PORTRAIT = { width: 390, height: 844 };
const INK_MIN = 0.02; // the drawn board gives about 4.5% and a blank one 0 (measured with the board left out of the room, 2026-11-18)

/** Window-pixel corners (left top, right bottom) of the board seen from `stop`'s pose in a window of `size`. */
function boardRect(size: { width: number; height: number }, stop: number) {
  const s = framingFor(size).cameraAt({ kind: "at", stop });
  const cam = new PerspectiveCamera(s.fov, size.width / size.height, 0.01, 50);
  cam.position.set(...s.camera); cam.lookAt(new Vector3(...s.look)); cam.updateMatrixWorld();
  const a = (board.yaw * Math.PI) / 180, [cx, cy, cz] = board.centre, [w, h] = board.size;
  const at = (dx: number, dy: number) => {
    const v = new Vector3(cx + Math.cos(a) * dx, cy + dy, cz - Math.sin(a) * dx).project(cam);
    return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
  };
  const [x0, y0] = at(-w / 2, h / 2), [x1, y1] = at(w / 2, -h / 2);
  return { x0, y0, x1, y1 };
}

/** The share of the board's middle that is ink-coloured. The baked board is dim and green (red and blue both under green); the marker ink
 *  is navy and dark red, so a pixel with blue or red over green is ink. `trim` is the share of each side left out. */
async function inkShare(page: Page, shot: Buffer, size: { width: number; height: number }, scale: number, stop: number, trim = 0.2) {
  // The board is seen at a slant, so its corners don't make a window-aligned rectangle: only the middle 60% of the box is read, which is all board.
  const q = boardRect(size, stop), mx = (q.x1 - q.x0) * trim, my = (q.y1 - q.y0) * trim;
  const r = { x0: (q.x0 + mx) * scale, y0: (q.y0 + my) * scale, x1: (q.x1 - mx) * scale, y1: (q.y1 - my) * scale };
  return page.evaluate(async ({ src, r, size }) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
    const x0 = Math.max(0, Math.floor(r.x0)), y0 = Math.max(0, Math.floor(r.y0)), x1 = Math.min(size.width, Math.ceil(r.x1)), y1 = Math.min(size.height, Math.ceil(r.y1));
    const visible = Math.max(0, x1 - x0) * Math.max(0, y1 - y0) / ((r.x1 - r.x0) * (r.y1 - r.y0));
    if (x1 - x0 < 2 || y1 - y0 < 2) return { share: 0, visible };
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let ink = 0;
    for (let k = 0; k < d.length; k += 4) if (d[k + 2] > d[k + 1] + 3 || d[k] > d[k + 1] + 3) ink++;
    return { share: ink / (d.length / 4), visible };
  }, { src: "data:image/png;base64," + shot.toString("base64"), r, size: { width: size.width * scale, height: size.height * scale } });
}

async function openOverview(browser: Browser, size: { width: number; height: number }, scale: number) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 403, json: {} }));
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await expect(page.locator("[data-meter-bar]")).toBeVisible();
  await page.waitForTimeout(2500); // the camera's glide and the power-on
  return { ctx, page };
}

test("the board shows its topology at the landscape overview (1280x720)", async ({ browser }) => {
  const { ctx, page } = await openOverview(browser, LANDSCAPE, 4);
  const shot = await page.screenshot({ path: "test-results/board-landscape-overview.png" });
  const { share, visible } = await inkShare(page, shot, LANDSCAPE, 4, 0);
  expect(visible, "the whole board is in frame").toBeGreaterThan(0.99);
  expect(share, "marker ink on the board").toBeGreaterThan(INK_MIN);
  await ctx.close();
});

// Only the board's left edge is in frame on the portrait overview (accepted, #335): a few pixels of blank margin, so there is no ink to look for.
test("the board's edge is in frame on the portrait overview (390x844)", async ({ browser }) => {
  const { ctx, page } = await openOverview(browser, PORTRAIT, 2);
  const shot = await page.screenshot({ path: "test-results/board-portrait-overview.png" });
  const { visible } = await inkShare(page, shot, PORTRAIT, 2, 0, 0);
  expect(visible, "part of the board is in frame").toBeGreaterThan(0.05);
  await ctx.close();
});

// At a station the camera looks at that station's TV, and the board is out of frame at all three, bar a sliver under the About me panel (checked from the pose, not drawn):
// it is drawn all the same, once, with the room, and idle.spec.ts shows nothing draws at rest.
test("the board is out of frame, bar a sliver, at each station in both framings", async () => {
  for (const size of [LANDSCAPE, PORTRAIT]) for (const stop of [1, 2, 3]) {
    const r = boardRect(size, stop);
    const inFrame = r.x1 > 0 && r.x0 < size.width && r.y1 > 0 && r.y0 < size.height && r.x1 > r.x0;
    expect(inFrame && Math.min(r.x1, size.width) - Math.max(r.x0, 0) > 40, `${size.width}x${size.height} stop ${stop}`).toBe(false);
  }
});
