import { describe, it, expect } from "vitest";
import { stations, ui } from "./content";
import { SIDE, hudTier } from "./pin";
import { PerspectiveCamera, Vector3 } from "three";
import { hudBoxes, overviewPose, PIN_H, pinAt, pinPlaces, pinWidth, pinWords, reach, type PinPlace } from "./pins";

const places = (win: { width: number; height: number }) => pinPlaces(overviewPose(win), win);
const boxOf = (p: PinPlace) => ({ left: p.x - p.width / 2, top: p.y - p.height, width: p.width, height: p.height });
const meets = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

describe("the pins' words", () => {
  it("are '1 Work', '2 Projects' and '3 About me', one per station, in tour order", () => {
    expect(stations.map((_, i) => pinWords(i))).toEqual(["1 Work", "2 Projects", "3 About me"]);
    expect(Object.keys(ui.pins)).toEqual(stations.map((s) => s.id));
  });
  it("make a wider box for a longer name", () => {
    expect(pinWidth(pinWords(2))).toBeGreaterThan(pinWidth(pinWords(0)));
  });
});

describe("where the pins stand", () => {
  it("shows all three at 1440 x 900 and 1920 x 1080, in tour order, each pill above its glass", () => {
    for (const win of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
      const p = places(win);
      expect(p, `${win.width} x ${win.height}`).not.toBeNull();
      expect(p!.map((x) => x.stop)).toEqual([1, 2, 3]);
      for (const pin of p!) expect(pin.height).toBe(PIN_H);
    }
  });

  it("gives none for all three on a portrait window", () => {
    for (const win of [{ width: 390, height: 844 }, { width: 800, height: 1000 }, { width: 999, height: 1000 }]) expect(places(win)).toBeNull();
  });

  it("hides all three, never some, where the two-line HUD stands under the stations (1024 x 768)", () => {
    expect(hudTier({ width: 1024, height: 768 })).toBe("twoLine");
    expect(places({ width: 1024, height: 768 })).toBeNull();
  });

  // Sweeps landscape windows from 560 to 1920 px wide, at 16:9, 16:10 and the short heights src/pin.test.ts sweeps (320 to 480). Whenever
  // the pins show, no pin meets the HUD's boxes or the device, leaves the window or meets another pin, at the camera's rest.
  it("never shows a pin that meets the HUD, the device, the window's edge or another pin, from 560 to 1920 wide at 16:9, 16:10 and short heights", () => {
    const bad: string[] = [];
    let shown = 0, hidden = 0;
    for (let width = 560; width <= 1920; width += 10) {
      const heights = [Math.round((width * 9) / 16), Math.round((width * 10) / 16), ...[320, 360, 400, 440, 480]];
      for (const height of heights) {
        const win = { width, height };
        if (width < height) continue;
        const p = places(win);
        if (!p) { hidden++; continue; }
        shown++;
        const avoid = hudBoxes(win);
        for (const pin of p) {
          const b = boxOf(pin);
          if (b.left < SIDE || b.left + b.width > width - SIDE || b.top < SIDE) bad.push(`${width}x${height}: pin ${pin.stop} leaves the window`);
          for (const h of avoid) if (meets(b, h)) bad.push(`${width}x${height}: pin ${pin.stop} meets a HUD box`);
          for (const o of p) if (o !== pin && meets(b, boxOf(o))) bad.push(`${width}x${height}: pins ${pin.stop} and ${o.stop} meet`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(shown, "pins show at the sizes the one-row HUD has room").toBeGreaterThan(100);
    expect(hidden, "and hide at the rest").toBeGreaterThan(100);
  });

  // The overview's camera slides with the pointer (src/tour.ts), so a pin that shows is clear of the HUD and the device wherever the pointer is.
  it("keeps every pin that shows clear of the HUD and the window's edge with the pointer at each corner of the window", () => {
    const bad: string[] = [];
    let checked = 0;
    for (let width = 1060; width <= 1920; width += 20) for (const height of [Math.round((width * 9) / 16), Math.round((width * 10) / 16)]) {
      const win = { width, height }, pose = overviewPose(win);
      if (!pinPlaces(pose, win)) continue;
      checked++;
      for (const p of reach(pose)) {
        const cam = new PerspectiveCamera(p.fov, width / height, 0.01, 50);
        cam.position.set(...p.camera); cam.lookAt(new Vector3(...p.look)); cam.updateMatrixWorld();
        for (let i = 0; i < stations.length; i++) {
          const pin = pinAt(i, cam, win), b = boxOf(pin);
          if (b.left < SIDE || b.left + b.width > width - SIDE) bad.push(`${width}x${height}: pin ${pin.stop} leaves the window`);
          for (const h of hudBoxes(win)) if (meets(b, h)) bad.push(`${width}x${height}: pin ${pin.stop} meets a HUD box`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(checked).toBeGreaterThan(20);
  });

  it("shows pins only from the one-row HUD up, so none under the two-line and compact HUDs", () => {
    for (let width = 560; width <= 1920; width += 10) for (const height of [Math.round((width * 9) / 16), Math.round((width * 10) / 16), 400]) {
      const win = { width, height };
      if (width >= height && hudTier(win) !== "oneRow") expect(places(win), `${width}x${height}`).toBeNull();
    }
  });
});
