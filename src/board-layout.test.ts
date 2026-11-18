import { describe, it, expect } from "vitest";
import { content, ui, validateContent } from "./content";
import { boardLayout, BOARD_UNITS } from "./board-layout";

// The whiteboard's words (#385): the lab's topology, hostnames only. They are drawn on a board in the room, so they must pass
// the private-address check and not read as a live status, as the words on a TV do.
const words = ui.whiteboard as Record<string, string>;
const withBoard = (f: (w: Record<string, string>) => void) => {
  const c = structuredClone(content);
  f(c.ui.whiteboard as Record<string, string>);
  return validateContent(c);
};

describe("the whiteboard's words", () => {
  it("are the lab's topology, by name", () => {
    expect(words).toEqual({
      internet: "internet", tunnel: "Cloudflare Tunnel", tailnet: "tailnet",
      joseph: "joseph", hermit: "hermit (k3s)", git: "Git server", dns: "DNS",
      jotaro: "jotaro", echoes: "echoes (CI)",
    });
  });
  it("pass validateContent", () => {
    expect(validateContent(content)).toEqual([]);
  });
  it.each(Object.keys(words))("rejects %s when it is removed or empty", (k) => {
    expect(withBoard((w) => { delete w[k]; })).toContain(`ui.whiteboard.${k}: missing`);
    expect(withBoard((w) => { w[k] = " "; })).toContain(`ui.whiteboard.${k}: missing`);
  });
  // The break checks the ticket asks for: one for each rule, on the board's own group.
  it.each(["10.0.0.5", "192.168.1.20", "joseph.ts.net", "joseph.local", "fd12:3456::1"])("rejects an address on the board: %s", (a) => {
    expect(withBoard((w) => { w.joseph = `joseph ${a}`; })).toContain("ui.whiteboard.joseph: contains a private address");
  });
  it.each(["Healthy", "running", "OK", "up to date", "passing"])("rejects a live-status word on the board: %s", (s) => {
    expect(withBoard((w) => { w.hermit = `hermit (k3s) ${s}`; })).toContain("ui.whiteboard.hermit: reads as a live status");
  });
  it("walks a word added to the group, as it does for the ambient group", () => {
    const problems = withBoard((w) => { w.added = "Healthy"; }).join("\n");
    expect(problems).toContain("ui.whiteboard.added: reads as a live status");
  });
});

describe("what the board draws", () => {
  const layout = boardLayout(words);
  it("draws every word once and nothing else", () => {
    expect(layout.labels.map((l) => l.text).sort()).toEqual(Object.values(words).sort());
  });
  it("keeps every label inside the board", () => {
    for (const l of layout.labels) {
      expect(l.x, l.text).toBeGreaterThanOrEqual(0);
      expect(l.y, l.text).toBeGreaterThanOrEqual(0);
      expect(l.x, l.text).toBeLessThanOrEqual(BOARD_UNITS.width);
      expect(l.y, l.text).toBeLessThanOrEqual(BOARD_UNITS.height);
    }
  });
  it("links the internet to the tunnel, the tunnel to joseph and joseph to jotaro", () => {
    const pairs = layout.links.map((l) => `${l.from}>${l.to}`);
    expect(pairs).toEqual(["internet-box>tunnel-box", "tunnel-box>joseph-box", "joseph-box>jotaro-box"]);
    const ids = new Set(layout.boxes.map((b) => b.id));
    for (const l of layout.links) { expect(ids.has(l.from), l.from).toBe(true); expect(ids.has(l.to), l.to).toBe(true); }
  });
  it("holds hermit, the Git server and DNS inside joseph's box and echoes inside jotaro's", () => {
    const box = (id: string) => layout.boxes.find((b) => b.id === `${id}-box`)!;
    const inside = (labelId: string, boxId: string) => {
      const l = layout.labels.find((x) => x.id === `${labelId}-text`)!, b = box(boxId);
      return l.x >= b.x && l.x <= b.x + b.w && l.y >= b.y && l.y <= b.y + b.h;
    };
    for (const id of ["hermit", "git", "dns"]) expect(inside(id, "joseph"), id).toBe(true);
    expect(inside("echoes", "jotaro")).toBe(true);
  });
});
