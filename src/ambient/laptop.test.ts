import { describe, expect, it } from "vitest";
import { content, hasPrivateAddress, ui, validateContent } from "../content";
import {
  ALL_ROWS, CHAR_MS, COLS, CYCLE_MS, drawLaptop, HOLD_MS, laptopState, LAPTOP_H, LAPTOP_W, LINE_PAUSE_MS, ROWS, STILL_POS, TYPE_MS,
} from "./laptop";
import { recordingContext } from "./recording-context.test-helper";
import { STILL_T } from "./still";
import { ambientSurfaces, isFilled, layoutPlane, lifted, RESERVED } from "./surfaces";

/** The lab notes, approved by Adham on 2026-11-17 (#335, "The lab notes"), word for word and in order. */
const NOTES = [
  "13 Nov · 01 · First VM built from Terraform, then thrown away.",
  "14 Nov · 02 · Backup jobs now live in code.",
  "14 Nov · 03 · hermit, the k3s node, brought under Terraform.",
  "14 Nov · 04 · Git server brought under Terraform.",
  "14 Nov · 05 · echoes, the CI runner, rebuilt from code.",
  "14 Nov · 06 · New Pi-hole built from code. Cut over the same day.",
  "14 Nov · 07 · Rebuild order written down, manual steps included.",
  "14 Nov · 08 · Tailnet access rules moved into Terraform.",
  "14 Nov · 09 · Weekly drift check added.",
  "14 Nov · 10 · Terraform state moved to Cloudflare R2.",
  "16 Nov · 11 · echoes moved to jotaro, the second host.",
];
const COMMAND = "$ cat lab-notes.txt";
const good = () => structuredClone(content);

/** The time at which the cycle is `pos` ms in: the inverse of the phase rule, so a test can ask "what is on the screen `pos` ms into the cycle". */
const at = (pos: number) => STILL_T - STILL_POS + pos;
const typedText = (t: number) => laptopState(t).rows.map((r) => r.shown).join("");

describe("the lab notes' words", () => {
  const keys = Object.keys(ui.ambient).filter((k) => k === "laptopCommand" || k.startsWith("labNote"));
  it("are the approved command and eleven notes, word for word, in order, keyed inside ui.ambient", () => {
    expect(keys).toEqual(["laptopCommand", ...NOTES.map((_, i) => `labNote${String(i + 1).padStart(2, "0")}`)]);
    expect(keys.map((k) => ui.ambient[k])).toEqual([COMMAND, ...NOTES]);
  });
  it("carry no private address and read as no live status (the shipped words pass validateContent)", () => {
    for (const k of keys) expect(hasPrivateAddress(ui.ambient[k]), k).toBe(false);
    expect(validateContent(good())).toEqual([]);
  });
  // Break check: a note with a private address in it is rejected by validateContent. Put an address in any note and this fails to see a problem.
  it("validateContent rejects a note with a private address in it", () => {
    for (const bad of ["10.0.0.5", "192.168.1.20", "hermit.tail1234.ts.net"]) {
      const c = good();
      (c.ui.ambient as Record<string, string>).labNote03 = `14 Nov · 03 · hermit at ${bad}, brought under Terraform.`;
      expect(validateContent(c).join("\n"), bad).toContain("ui.ambient.labNote03: contains a private address");
    }
  });
  it("validateContent rejects a note that is missing, or that reads as a live status", () => {
    const c = good();
    delete (c.ui.ambient as Record<string, string>).labNote05;
    (c.ui.ambient as Record<string, string>).labNote06 = "14 Nov · 06 · Pi-hole healthy.";
    const problems = validateContent(c).join("\n");
    expect(problems).toContain("ui.ambient.labNote05: missing");
    expect(problems).toContain("ui.ambient.labNote06: reads as a live status");
  });
});

describe("ALL_ROWS", () => {
  it("wraps each line at COLS characters, at a space, a continuation indented", () => {
    const rows = ALL_ROWS;
    for (const r of rows) expect((r.indent + r.text).length).toBeLessThanOrEqual(COLS);
    // every word of every line is on the screen once, in order
    expect(rows.map((r) => r.text).join(" ").replace(/\s+/g, " ")).toBe([COMMAND, ...NOTES].join(" "));
    expect(rows[0]).toMatchObject({ line: 0, text: COMMAND, indent: "" });
    expect(rows.filter((r) => r.line > 0 && r.indent === "").length).toBe(NOTES.length);
  });
});

describe("laptopState: how much is typed at t", () => {
  it("has typed nothing at the start of the cycle, with the cursor at the first row", () => {
    const s = laptopState(at(0));
    expect(s.done).toBe(false);
    expect(typedText(at(0))).toBe("");
    expect(s.rows).toHaveLength(1);
  });
  it("types one character every CHAR_MS: the command first", () => {
    expect(typedText(at(CHAR_MS * 2 + 1))).toBe("$ ");
    expect(typedText(at(CHAR_MS * 5 + 1))).toBe("$ cat");
    expect(typedText(at(CHAR_MS * COMMAND.length))).toBe(COMMAND);
  });
  it("pauses LINE_PAUSE_MS after a line, then starts the next note", () => {
    const end = CHAR_MS * COMMAND.length;
    expect(typedText(at(end + LINE_PAUSE_MS - 1))).toBe(COMMAND);
    expect(laptopState(at(end + LINE_PAUSE_MS - 1)).rows).toHaveLength(1);
    const s = laptopState(at(end + LINE_PAUSE_MS + CHAR_MS * 2 + 1));
    expect(s.rows.map((r) => r.shown)).toEqual([COMMAND, "13"]);
  });
  it("types more as time goes on, never less, until the cycle is done", () => {
    let last = -1;
    for (let pos = 0; pos < TYPE_MS; pos += 97) {
      const n = laptopState(at(pos)).typedChars;
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
  });
  it("is the same a cycle later, a cycle earlier and many cycles on", () => {
    const a = laptopState(at(12345));
    for (const k of [-3, -1, 1, 7]) expect(laptopState(at(12345 + k * CYCLE_MS))).toEqual(a);
  });
});

describe("the scroll", () => {
  it("shows at most ROWS rows, and while it fits, from the first row", () => {
    expect(laptopState(at(CHAR_MS * 5)).first).toBe(0);
    for (let pos = 0; pos < TYPE_MS; pos += 211) expect(laptopState(at(pos)).rows.length).toBeLessThanOrEqual(ROWS);
  });
  it("scrolls once the typing passes the last row: the newest row is the screen's last, the first one gone", () => {
    const all = ALL_ROWS;
    // the moment the row after the screen's last row is begun
    const k = ROWS;
    let start = 0;
    for (let i = 0; i < k; i++) start += all[i].text.length * CHAR_MS + (all[i + 1].line !== all[i].line ? LINE_PAUSE_MS : 0);
    const s = laptopState(at(start + CHAR_MS + 1));
    expect(s.first).toBe(1);
    expect(s.rows).toHaveLength(ROWS);
    expect(s.rows[ROWS - 1].shown).toBe(all[k].text.slice(0, 1));
    expect(s.rows[0].index).toBe(1);
  });
});

describe("the restart", () => {
  it("holds the finished screen for a while after the last note, then starts again blank", () => {
    expect(laptopState(at(TYPE_MS)).done).toBe(true);
    expect(laptopState(at(TYPE_MS + HOLD_MS - 1)).done).toBe(true);
    const again = laptopState(at(CYCLE_MS));
    expect(again.done).toBe(false);
    expect(again.typedChars).toBe(0);
    expect(CYCLE_MS).toBe(TYPE_MS + HOLD_MS);
  });
});

describe("the still frame: the last screenful, fully typed, at STILL_T", () => {
  // Break check: change STILL_POS to a position mid-typing (say 5000) and these fail.
  it("is done at STILL_T, a cycle on, and with the whole last screenful showing", () => {
    for (const t of [STILL_T, STILL_T + CYCLE_MS, STILL_T + 5 * CYCLE_MS]) {
      const s = laptopState(t);
      expect(s.done).toBe(true);
      expect(s.rows).toHaveLength(ROWS);
      expect(s.rows.map((r) => r.indent + r.shown)).toEqual(ALL_ROWS.slice(-ROWS).map((r) => r.indent + r.text));
      expect(s.rows[ROWS - 1].shown.endsWith("the second host.")).toBe(true);
    }
  });
  it("sits inside the hold, with room either side", () => {
    expect(STILL_POS).toBeGreaterThan(TYPE_MS);
    expect(STILL_POS).toBeLessThan(TYPE_MS + HOLD_MS);
  });
});

describe("drawLaptop", () => {
  it("fits the canvas reserved for it, and the plane's shape (not stretched)", () => {
    expect(LAPTOP_W).toBeLessThanOrEqual(RESERVED.laptop.w);
    expect(LAPTOP_H).toBeLessThanOrEqual(RESERVED.laptop.h);
    const p = layoutPlane("laptop");
    expect(LAPTOP_W / LAPTOP_H).toBeCloseTo(p.width / p.height, 1);
  });
  it("draws the typed text, as texture, over the whole canvas", () => {
    const { ctx, texts, calls } = recordingContext();
    drawLaptop(ctx, at(CHAR_MS * 5));
    expect(texts).toEqual(["$ cat"]);
    expect(calls).toContain(`fillRect(0,0,${LAPTOP_W},${LAPTOP_H})`);
  });
  it("draws the whole last screenful at STILL_T", () => {
    const { ctx, texts } = recordingContext();
    drawLaptop(ctx, STILL_T);
    expect(texts.join(" ").replace(/\s+/g, " ")).toBe(ALL_ROWS.slice(-ROWS).map((r) => r.text).join(" "));
    expect(texts.join(" ")).toContain("jotaro");
  });
  it("says the canvas is unchanged (false) when the same state is drawn again: no new character, no blink, still holding", () => {
    const { ctx } = recordingContext();
    expect(drawLaptop(ctx, STILL_T)).not.toBe(false);
    expect(drawLaptop(ctx, STILL_T + 80)).toBe(false);
    expect(drawLaptop(ctx, at(TYPE_MS + 300))).toBe(false);
  });
  it("draws on when a character is typed", () => {
    const { ctx } = recordingContext();
    drawLaptop(ctx, at(CHAR_MS * 5 + 1));
    expect(drawLaptop(ctx, at(CHAR_MS * 6 + 1))).not.toBe(false);
  });
  // The still frame must reach the glass: the driver skips the upload when draw says false.
  it("a still frame after a tick mid-cycle repaints the canvas (it does not answer false) and leaves the last screenful, fully typed", () => {
    const { ctx, texts } = recordingContext();
    drawLaptop(ctx, at(CHAR_MS * 40));
    texts.length = 0;
    expect(drawLaptop(ctx, STILL_T)).not.toBe(false);
    expect(texts.join(" ")).toContain("jotaro");
    expect(texts).toHaveLength(ROWS);
  });
  it("a tick in the hold is already the still frame: the canvas needs nothing", () => {
    const { ctx } = recordingContext();
    drawLaptop(ctx, at(TYPE_MS + 10));
    expect(drawLaptop(ctx, STILL_T)).toBe(false);
  });
  it("a still frame after a tick in the middle of the last note, and of the first, also repaints", () => {
    for (const pos of [CHAR_MS * 3, TYPE_MS - CHAR_MS * 8, TYPE_MS - 1]) {
      const { ctx } = recordingContext();
      drawLaptop(ctx, at(pos));
      expect(drawLaptop(ctx, STILL_T), `from ${pos}`).not.toBe(false);
    }
  });
});

describe("the laptop's plane in the surface list", () => {
  const entry = ambientSurfaces([]).find((e) => e.id === "laptop")!;
  it("is filled, with the canvas it draws and its plane from room-layout.json's laptop entry", () => {
    expect(isFilled(entry)).toBe(true);
    if (!isFilled(entry)) return;
    expect(entry.size).toEqual({ w: LAPTOP_W, h: LAPTOP_H });
    expect(entry.draw).toBe(drawLaptop);
    const base = layoutPlane("laptop");
    expect(entry.plane).toMatchObject({ yaw: base.yaw, tilt: base.tilt, width: base.width, height: base.height });
  });
  // The baked screen is coplanar with the entry's plane (#380), so the notes stand a millimetre or two in front of it, toward the camera (+z at rest).
  it("stands 2 mm in front of the baked screen, along the screen's own normal, toward the camera", () => {
    if (!isFilled(entry)) throw new Error("not filled");
    const base = layoutPlane("laptop");
    const d = entry.plane.position.map((v, i) => v - base.position[i]);
    expect(Math.hypot(...d)).toBeCloseTo(0.002, 6);
    expect(d[2]).toBeGreaterThan(0);
    expect(d[1]).toBeGreaterThan(0); // the lid leans back, so its face looks up a little: in front is up as well as toward the camera
    const n = [Math.sin(base.yaw) * Math.cos(base.tilt), Math.sin(base.tilt), Math.cos(base.yaw) * Math.cos(base.tilt)];
    d.forEach((v, i) => expect(v).toBeCloseTo(n[i] * 0.002, 9));
  });
  it("lifted() moves a plane along its normal and keeps its shape", () => {
    const p = { position: [1, 2, 3] as [number, number, number], yaw: Math.PI / 2, tilt: 0, width: 0.3, height: 0.2 };
    const q = lifted(p, 0.01);
    expect(q.position[0]).toBeCloseTo(1.01, 9);
    expect(q.position[1]).toBe(2);
    expect(q.position[2]).toBeCloseTo(3, 9);
    expect(q).toMatchObject({ yaw: p.yaw, tilt: p.tilt, width: p.width, height: p.height });
  });
});
