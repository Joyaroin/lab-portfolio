import { ui } from "../content";
import { SCREEN_H, SCREEN_W, wrap } from "./still";

// The Home lab CRT: a green line drawing of the lab, with dots travelling along it. Decoration only.

type Point = readonly [number, number];
/** The rail the dots travel: from under "Tunnel", by "Proxmox", to under "k3s". */
export const TRAFFIC_PATH: readonly Point[] = [[75, 220], [200, 220], [325, 220]];
export const DOT_COUNT = 6;
/** Milliseconds for one dot to cross the whole path. */
export const CROSSING_MS = 1700;
const BOXES = [["tunnel", 20], ["proxmox", 145], ["k3s", 270]] as const;
const BOX_Y = 110, BOX_W = 110, BOX_H = 80;

export type Dot = { x: number; y: number; alpha: number };

/** The point a fraction p (0..1) of the way along the path, by length. */
export function pointAlong(path: readonly Point[], p: number): [number, number] {
  const lengths = path.slice(1).map((b, i) => Math.hypot(b[0] - path[i][0], b[1] - path[i][1]));
  let left = p * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] === 0 ? 0 : Math.min(left / lengths[i], 1);
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f];
    }
    left -= lengths[i];
  }
  return [...path[0]];
}

/** Where the dots are at time t. Each fades in at the start of the path and out at the end. */
export function trafficDots(t: number): Dot[] {
  return Array.from({ length: DOT_COUNT }, (_, k) => {
    const p = wrap(t / CROSSING_MS + k / DOT_COUNT, 1);
    const [x, y] = pointAlong(TRAFFIC_PATH, p);
    return { x, y, alpha: Math.sin(p * Math.PI) };
  });
}

export function drawTraffic(c: CanvasRenderingContext2D, t: number) {
  const words = ui.ambient;
  c.fillStyle = "#04140c"; c.fillRect(0, 0, SCREEN_W, SCREEN_H);
  c.strokeStyle = "#5fd696"; c.lineWidth = 3; c.fillStyle = "#7dffb0"; c.font = "bold 24px Menlo, monospace"; c.textAlign = "center";
  c.shadowColor = "#7dffb0"; c.shadowBlur = 8;
  const [tunnel, proxmox, k3s] = BOXES.map(([key, x]) => ({ label: words[key], x }));
  for (const { label, x } of [tunnel, proxmox, k3s]) { c.strokeRect(x, BOX_Y, BOX_W, BOX_H); c.fillText(label, x + BOX_W / 2, 158); }
  // the arrows between the boxes, and the rail the dots run on, with a stub up to each box
  c.beginPath();
  c.moveTo(130, 150); c.lineTo(145, 150); c.moveTo(255, 150); c.lineTo(270, 150);
  for (const [x] of TRAFFIC_PATH) { c.moveTo(x, BOX_Y + BOX_H); c.lineTo(x, TRAFFIC_PATH[0][1]); }
  c.stroke();
  c.globalAlpha = 0.45; c.beginPath();
  TRAFFIC_PATH.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke(); c.globalAlpha = 1;
  for (const d of trafficDots(t)) {
    c.globalAlpha = d.alpha; c.beginPath(); c.arc(d.x, d.y, 6, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1; c.font = "18px Menlo, monospace"; c.fillStyle = "#4f9c72"; c.shadowBlur = 0;
  c.fillText(words.trafficCaption, 200, 70); c.textAlign = "start";
}
