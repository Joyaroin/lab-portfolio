import { describe, it, expect } from "vitest";
import { puzzleFrame, drawPuzzle, WORDS, CYCLE_MS, LEAD_MS, LETTER_MS, SCRAMBLE_MS } from "./puzzle";
import { STILL_T } from "./still";
import { ui } from "../content";
import { recordingContext } from "./recording-context.test-helper";

describe("the words", () => {
  it("are RELIABLE, MAINTAINABLE and SECURE, in turn", () => {
    expect(WORDS).toEqual(["RELIABLE", "MAINTAINABLE", "SECURE"]);
    WORDS.forEach((w, i) => expect(puzzleFrame(i * CYCLE_MS).word).toBe(w));
    expect(puzzleFrame(3 * CYCLE_MS).word).toBe("RELIABLE"); // and round again
    expect(puzzleFrame(4 * CYCLE_MS + 100).word).toBe("MAINTAINABLE");
  });
});

describe("puzzleFrame", () => {
  it("gives a frame for a negative t, the word before time zero going round the other way", () => {
    const f = puzzleFrame(-1);
    expect(f.word).toBe("SECURE");
    expect(f.text).toHaveLength(f.word.length);
    expect(puzzleFrame(-CYCLE_MS).word).toBe("SECURE");
    expect(puzzleFrame(-CYCLE_MS - 1).word).toBe("MAINTAINABLE");
    for (const t of [-1, -77, -3 * CYCLE_MS, -12345, -1e6]) {
      const g = puzzleFrame(t);
      expect(g.text).toHaveLength(g.word.length);
      expect(g.text).not.toContain("undefined"); // a glyph looked up at a negative index
    }
  });
  const turn = (i: number, local: number) => puzzleFrame(i * CYCLE_MS + local);
  it("starts each turn scrambled, with the decoding status", () => {
    WORDS.forEach((w, i) => {
      const f = turn(i, 100);
      expect(f.text).toHaveLength(w.length);
      expect(f.text).not.toBe(w);
      expect(f.solved).toBe(false);
      expect(f.status).toBe("[ decoding… ]");
    });
  });
  it("decodes one letter at a time from the left", () => {
    WORDS.forEach((w, i) => {
      for (let n = 1; n < w.length; n++) {
        const f = turn(i, LEAD_MS + n * LETTER_MS + 10);
        expect(f.text.slice(0, n), `${w} letter ${n}`).toBe(w.slice(0, n));
        expect(f.text).toHaveLength(w.length);
        for (let k = n; k < w.length; k++) expect(f.text[k]).not.toBe(w[k]);
        expect(f.solved).toBe(false);
        expect(f.status).toBe("[ decoding… ]");
      }
    });
  });
  it("shows the word exactly, and [ solved ], once every letter has decoded", () => {
    WORDS.forEach((w, i) => {
      const f = turn(i, LEAD_MS + w.length * LETTER_MS + 10);
      expect(f.text).toBe(w);
      expect(f.solved).toBe(true);
      expect(f.status).toBe("[ solved ]");
      expect(turn(i, CYCLE_MS - SCRAMBLE_MS - 1).text).toBe(w); // and holds until the scramble
    });
  });
  it("scrambles at the end of the turn, then the next word begins", () => {
    WORDS.forEach((w, i) => {
      const f = turn(i, CYCLE_MS - SCRAMBLE_MS + 50);
      expect(f.text).toHaveLength(w.length);
      expect(f.text).not.toBe(w);
      expect(f.solved).toBe(false);
      expect(f.status).toBe("[ decoding… ]");
    });
  });
  it("is solved only on the exact word, over a whole sweep", () => {
    for (let t = 0; t < 4 * CYCLE_MS; t += 37) {
      const f = puzzleFrame(t);
      expect(f.text.length).toBe(f.word.length);
      if (f.solved) { expect(f.text).toBe(f.word); expect(f.status).toBe("[ solved ]"); }
      else { expect(f.text).not.toBe(f.word); expect(f.status).toBe("[ decoding… ]"); }
    }
  });
  it("draws a faint hex dump, nine rows of hex, that changes slowly", () => {
    const f = puzzleFrame(STILL_T);
    expect(f.hex).toHaveLength(9);
    for (const row of f.hex) expect(row).toMatch(/^([0-9a-f]{2} ?){16}$/);
    expect(puzzleFrame(STILL_T + 100).hex).toEqual(f.hex);
    expect(puzzleFrame(STILL_T + 400).hex).not.toEqual(f.hex);
  });
  it("shows SECURE solved in the still frame", () => {
    const f = puzzleFrame(STILL_T);
    expect(f.word).toBe("SECURE");
    expect(f.text).toBe("SECURE");
    expect(f.status).toBe("[ solved ]");
  });
});

describe("drawPuzzle", () => {
  it("draws the hex rows, the word and the status", () => {
    const { ctx, texts } = recordingContext();
    drawPuzzle(ctx, STILL_T);
    expect(texts).toHaveLength(11);
    expect(texts.slice(-2)).toEqual(["SECURE", ui.ambient.puzzleSolved]);
  });
});
