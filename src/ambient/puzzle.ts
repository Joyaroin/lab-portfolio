import { ui } from "../content";
import { SCREEN_H, SCREEN_W, wrap } from "./still";

// The Software factory CRT: a faint hex dump behind one word that decodes letter by letter into
// what the work is for, then scrambles, then the next word.

/** The words, in turn. */
export const WORDS = [ui.ambient.wordReliable, ui.ambient.wordMaintainable, ui.ambient.wordSecure];
const GLYPHS = "ABCDEF0123456789#$%&*+<>/\\";
/** One word's whole turn, in ms. */
export const CYCLE_MS = 5200;
/** The scramble before the first letter decodes. */
export const LEAD_MS = 600;
/** Each letter decodes this long after the one before. */
export const LETTER_MS = 220;
/** The word scrambles again for the last part of its turn. */
export const SCRAMBLE_MS = 700;
const HEX_ROWS = 9;

export type PuzzleFrame = {
  word: string;
  /** what is on the glass: decoded letters, then scrambled glyphs */
  text: string;
  solved: boolean;
  status: string;
  hex: string[];
};

export function puzzleFrame(t: number): PuzzleFrame {
  const word = WORDS[Math.floor(t / CYCLE_MS) % WORDS.length];
  const local = wrap(t, CYCLE_MS);
  const decoded = Math.min(word.length, Math.floor(Math.max(0, local - LEAD_MS) / LETTER_MS));
  const scrambling = local > CYCLE_MS - SCRAMBLE_MS;
  let text = "";
  for (let i = 0; i < word.length; i++) {
    if (!scrambling && i < decoded) { text += word[i]; continue; }
    let g = GLYPHS[(Math.floor(t / 60) + i * 7) % GLYPHS.length];
    if (g === word[i]) g = GLYPHS[(GLYPHS.indexOf(g) + 1) % GLYPHS.length]; // a letter is never decoded by chance
    text += g;
  }
  const solved = decoded === word.length && !scrambling;
  const hex = Array.from({ length: HEX_ROWS }, (_, r) => {
    let row = "";
    for (let i = 0; i < 16; i++) row += (Math.floor(Math.sin(r * 31 + i * 7 + Math.floor(t / 400)) * 1e4) & 255).toString(16).padStart(2, "0") + (i % 2 ? " " : "");
    return row;
  });
  return { word, text, solved, status: solved ? ui.ambient.puzzleSolved : ui.ambient.puzzleDecoding, hex };
}

export function drawPuzzle(c: CanvasRenderingContext2D, t: number) {
  const f = puzzleFrame(t);
  c.fillStyle = "#03110a"; c.fillRect(0, 0, SCREEN_W, SCREEN_H);
  c.font = "15px Menlo, monospace"; c.fillStyle = "#2c6b48";
  f.hex.forEach((row, r) => c.fillText(row, 14, 32 + r * 31));
  c.fillStyle = "rgba(3,17,10,.75)"; c.fillRect(20, 108, 360, 92);
  c.textAlign = "center"; c.shadowColor = "#8dffb9";
  c.font = `bold ${f.word.length > 9 ? 40 : 46}px Menlo, monospace`;
  c.shadowBlur = f.solved ? 14 : 4; c.fillStyle = f.solved ? "#c8ffdd" : "#8dffb9";
  c.fillText(f.text, 200, 170);
  c.shadowBlur = 0; c.font = "16px Menlo, monospace"; c.fillStyle = "#4f9c72";
  c.fillText(f.status, 200, 236); c.textAlign = "start";
}
