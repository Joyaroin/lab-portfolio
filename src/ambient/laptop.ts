import { ui } from "../content";
import { cyclePosition } from "./phase";

// The opened laptop's screen on the back desk (#384): it types the lab notes (`ui.ambient`, #335) one character at a time, a note a line,
// scrolls a row at a time once the screen is full, holds the finished screen a while, and starts again. Words drawn into a texture, as
// texture: at the overview they are a few pixels tall and aren't meant to be read (ADR 0001). Its still frame is the last screenful,
// fully typed.

/** The canvas: the plane's shape (0.27 × 0.165 m), within the 136×112 reserved for it. */
export const LAPTOP_W = 136, LAPTOP_H = 84;
/** Characters a row holds, rows the screen shows, and a row's height in px (the font is 7 px). */
export const COLS = 30, ROWS = 8, ROW_H = 9;
const MARGIN_X = 5, MARGIN_Y = 6;
/** Milliseconds a character takes, the pause after a line, and how long the finished screen holds before the cycle starts again. */
export const CHAR_MS = 70, LINE_PAUSE_MS = 350, HOLD_MS = 6000;
/** The cursor is on for this many milliseconds, then off for as many. */
const BLINK_MS = 400;

/** A screen row: the `line` it belongs to (0 is the command, 1 to 11 the notes), its `text` and the `indent` a continuation has. */
export type Row = { line: number; text: string; indent: string };

/** A line wrapped greedily at spaces into rows of at most COLS characters, a continuation indented by two spaces. */
function wrapLine(text: string, line: number): Row[] {
  const rows: Row[] = [];
  let cur = "";
  for (const word of text.split(" ")) {
    if (cur && ((rows.length ? "  " : "") + cur + " " + word).length > COLS) { rows.push({ line, text: cur, indent: rows.length ? "  " : "" }); cur = word; }
    else cur = cur ? cur + " " + word : word;
  }
  rows.push({ line, text: cur, indent: rows.length ? "  " : "" });
  return rows;
}

/** The lines typed: the command, then the notes in the order of their keys in `ui.ambient`. */
const LINES = [ui.ambient.laptopCommand, ...Object.keys(ui.ambient).filter((k) => k.startsWith("labNote")).map((k) => ui.ambient[k])];
/** Every screen row, in order. */
export const ALL_ROWS: Row[] = LINES.flatMap(wrapLine);

/** When each row starts being typed (ms into the cycle): the pause after a line comes before the next line's first row. */
const STARTS: number[] = [];
/** Milliseconds the typing takes in a cycle. */
export const TYPE_MS = ALL_ROWS.reduce((t, r, i) => {
  if (i > 0 && r.line !== ALL_ROWS[i - 1].line) t += LINE_PAUSE_MS;
  STARTS.push(t);
  return t + r.text.length * CHAR_MS;
}, 0);
/** One cycle: the typing, then the finished screen held. */
export const CYCLE_MS = TYPE_MS + HOLD_MS;
/** Where in the cycle the still frame is: half-way through the hold, with every character typed. */
export const STILL_POS = TYPE_MS + HOLD_MS / 2;

/** A row as the screen shows it: its place in `ALL_ROWS`, and as much of its text as is typed. */
export type Shown = { index: number; indent: string; shown: string };
/** What the screen shows at time `t`. `rows` are the rows on it (at most ROWS, the newest last), `first` the index of the first, `typedChars` the
 *  characters typed in the cycle so far, `done` whether the typing has finished (the finished screen is held), `cursor` whether the cursor is lit. */
export type LaptopState = { rows: Shown[]; first: number; typedChars: number; done: boolean; cursor: boolean };

export function laptopState(t: number): LaptopState {
  const pos = cyclePosition(t, CYCLE_MS, STILL_POS);
  const done = pos >= TYPE_MS;
  // The row being typed: the last one that has started, or the last row of all once the typing is done.
  let k = done ? ALL_ROWS.length - 1 : 0;
  if (!done) while (k + 1 < ALL_ROWS.length && STARTS[k + 1] <= pos) k++;
  const first = Math.max(0, k + 1 - ROWS);
  const rows: Shown[] = [];
  let typedChars = 0;
  for (let i = 0; i <= k; i++) {
    const r = ALL_ROWS[i];
    const n = done || i < k ? r.text.length : Math.min(r.text.length, Math.floor(Math.max(0, pos - STARTS[i]) / CHAR_MS));
    typedChars += n;
    if (i >= first) rows.push({ index: i, indent: r.indent, shown: r.text.slice(0, n) });
  }
  return { rows, first, typedChars, done, cursor: !done && Math.floor(pos / BLINK_MS) % 2 === 0 };
}

/** What is on each canvas drawn into, so that a frame like the last one can be left alone (`draw` answers `false`: no upload). */
const onCanvas = new WeakMap<object, string>();

/** Draws frame `t` over the whole canvas: a dark green screen, the typed rows in green monospace, a block cursor at the end of the newest. Opaque.
 *  Answers `false` when nothing on the screen would change from the frame already on this canvas. */
export function drawLaptop(c: CanvasRenderingContext2D, t: number): boolean | void {
  const s = laptopState(t);
  const key = `${s.first}:${s.typedChars}:${s.cursor}:${s.done}`;
  if (onCanvas.get(c) === key) return false;
  onCanvas.set(c, key);
  c.fillStyle = "#031a0b"; c.fillRect(0, 0, LAPTOP_W, LAPTOP_H);
  c.font = "7px Menlo, monospace"; c.textBaseline = "alphabetic";
  s.rows.forEach((r, i) => {
    const y = MARGIN_Y + (i + 1) * ROW_H - 2;
    c.fillStyle = ALL_ROWS[r.index].line === 0 ? "#d2ffe0" : "#63e08f";
    c.fillText(r.indent + r.shown, MARGIN_X, y);
  });
  if (s.cursor) {
    const last = s.rows[s.rows.length - 1];
    const x = MARGIN_X + (last ? (last.indent.length + last.shown.length) * 4.2 : 0), y = MARGIN_Y + Math.max(1, s.rows.length) * ROW_H - 9;
    c.fillStyle = "#d2ffe0"; c.fillRect(x, y, 3, 8);
  }
}
