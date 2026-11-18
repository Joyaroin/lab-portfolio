import { useMemo } from "react";
import { props } from "./crts";
import { ui } from "./content";
import { MONO } from "./card";
import { canvas, texture } from "./draw";
import { BOARD_UNITS, boardLayout, type Box } from "./board-layout";

// ---------------------------------------------------------------- the whiteboard
// The lab's topology in marker, drawn sharp at runtime over the blank board baked in the room (as the bezels' plates and notes are
// drawn over theirs). It is drawn once, when the room loads: no timer, no frame loop, nothing at rest. It is always drawn, in both
// framings and at every stop. What is drawn and where is `boardLayout` (board-layout.ts); its words are `ui.whiteboard`.
// The plane is the whiteboard's entry in room-layout.json (read through `props`): it is placed from there, not by hand here.
// The canvas holds only ink and is clear elsewhere, so the baked board shows through and the plane is no brighter than the room.

/** How far the plane stands in front of the baked board's face (metres). */
const BOARD_GAP = 0.003;
const INK = { line: "#0d1630", hot: "#3d0d0d", box: "#0f2a1c" };

const board = props.find((p) => p.kind === "board")!;

/** A hand-drawn line: a short wobble on each stroke, the same every time (no random). */
function stroke(g: CanvasRenderingContext2D, pts: [number, number][], seed: number) {
  g.beginPath();
  pts.forEach(([x, y], i) => {
    const j = Math.sin(seed * 12.9898 + i * 78.233) * 1.4;
    if (i === 0) g.moveTo(x + j, y - j); else g.lineTo(x - j, y + j);
  });
  g.stroke();
}

function arrowhead(g: CanvasRenderingContext2D, from: [number, number], to: [number, number]) {
  const a = Math.atan2(to[1] - from[1], to[0] - from[0]), s = 14;
  g.beginPath();
  g.moveTo(to[0] - s * Math.cos(a - 0.45), to[1] - s * Math.sin(a - 0.45)); g.lineTo(to[0], to[1]); g.lineTo(to[0] - s * Math.cos(a + 0.45), to[1] - s * Math.sin(a + 0.45));
  g.stroke();
}

function boxPath(g: CanvasRenderingContext2D, b: Box) {
  g.beginPath();
  if (b.shape === "cloud") {
    const { x, y, w, h } = b, r = h * 0.3;
    g.moveTo(x + r, y + h); g.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI * 1.5);
    g.arc(x + w * 0.32, y + r * 1.1, r * 1.1, Math.PI, Math.PI * 1.9);
    g.arc(x + w * 0.64, y + r * 1.25, r * 1.3, Math.PI * 1.15, Math.PI * 2.1);
    g.arc(x + w - r, y + h - r, r, Math.PI * 1.5, Math.PI / 2);
    g.closePath();
  } else if (b.shape === "pipe") {
    const r = b.h / 2;
    g.moveTo(b.x + r, b.y); g.lineTo(b.x + b.w - r, b.y); g.arc(b.x + b.w - r, b.y + r, r, -Math.PI / 2, Math.PI / 2);
    g.lineTo(b.x + r, b.y + b.h); g.arc(b.x + r, b.y + r, r, Math.PI / 2, Math.PI * 1.5); g.closePath();
  } else {
    g.roundRect(b.x, b.y, b.w, b.h, 12);
  }
}

export function drawBoard(c: HTMLCanvasElement, words: Record<string, string>) {
  const g = c.getContext("2d")!, k = c.width / BOARD_UNITS.width;
  const { boxes, labels, links } = boardLayout(words);
  g.clearRect(0, 0, c.width, c.height);
  g.save(); g.scale(k, k);
  g.lineCap = "round"; g.lineJoin = "round";
  boxes.forEach((b) => {
    g.strokeStyle = b.shape === "machine" ? INK.box : INK.line; g.lineWidth = 5;
    boxPath(g, b); g.stroke();
  });
  links.forEach((l, i) => {
    g.strokeStyle = l.dashed ? INK.hot : INK.line; g.lineWidth = 5;
    g.setLineDash(l.dashed ? [16, 12] : []);
    stroke(g, l.points, i + 1);
    g.setLineDash([]);
    if (!l.dashed) arrowhead(g, l.points[l.points.length - 2], l.points[l.points.length - 1]);
  });
  g.textAlign = "center"; g.textBaseline = "middle";
  labels.forEach((l) => {
    g.fillStyle = l.id === "tailnet-text" ? INK.hot : INK.line;
    g.font = `bold ${l.size}px ${MONO}`;
    g.fillText(l.text, l.x, l.y, 330);
  });
  g.restore();
}

export function Whiteboard() {
  // Read once, on purpose: the board is drawn once, and moving the window to another screen doesn't redraw it.
  const dense = typeof devicePixelRatio === "number" && devicePixelRatio >= 1.5;
  const t = useMemo(() => {
    const px = dense ? 2000 : 1500; // pixels a metre: 720 x 540 (960 x 720 on a high-density screen)
    const c = canvas(Math.round(board.size[0] * px), Math.round(board.size[1] * px));
    drawBoard(c, ui.whiteboard);
    return texture(c);
  }, [dense]);
  const a = (board.yaw * Math.PI) / 180, [cx, cy, cz] = board.centre;
  return (
    <mesh position={[cx + Math.sin(a) * BOARD_GAP, cy, cz + Math.cos(a) * BOARD_GAP]} rotation={[0, a, 0]} renderOrder={2} raycast={() => null}>
      <planeGeometry args={board.size} />
      <meshBasicMaterial map={t} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
