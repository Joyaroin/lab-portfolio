// The lab's topology as the whiteboard shows it (#385): what is drawn and where, in board units, with no canvas in
// sight. Whiteboard.tsx paints it. The words come in (from `ui.whiteboard` in content.ts): hostnames only, and
// nothing here is an address or a live reading.

/** The board's drawing space. 4:3, like the board (0.48 x 0.36 m). */
export const BOARD_UNITS = { width: 720, height: 540 };

export type Box = { id: string; x: number; y: number; w: number; h: number; shape: "cloud" | "pipe" | "machine" };
export type Label = { id: string; text: string; x: number; y: number; size: number };
export type Link = { from: string; to: string; points: [number, number][]; dashed: boolean };

/** The internet, the Cloudflare Tunnel, joseph (holding hermit, the Git server and DNS), jotaro (holding echoes), and the
 *  tailnet linking the two machines. A label's x, y is the middle of its text. */
export function boardLayout(words: Record<string, string>) {
  const boxes: Box[] = [
    { id: "internet-box", x: 30, y: 30, w: 190, h: 90, shape: "cloud" },
    { id: "tunnel-box", x: 290, y: 40, w: 400, h: 70, shape: "pipe" },
    { id: "joseph-box", x: 30, y: 210, w: 340, h: 290, shape: "machine" },
    { id: "jotaro-box", x: 530, y: 290, w: 170, h: 130, shape: "machine" },
  ];
  const { internet, tunnel, tailnet, joseph, hermit, git, dns, jotaro, echoes } = words;
  const label = (id: string, text: string, x: number, y: number, size: number): Label => ({ id, text, x, y, size });
  const labels: Label[] = [
    label("internet-text", internet, 125, 75, 30),
    label("tunnel-text", tunnel, 490, 75, 32),
    label("joseph-text", joseph, 200, 252, 36),
    label("hermit-text", hermit, 200, 322, 30),
    label("git-text", git, 200, 387, 30),
    label("dns-text", dns, 200, 452, 30),
    label("jotaro-text", jotaro, 615, 325, 36),
    label("echoes-text", echoes, 615, 385, 24),
    label("tailnet-text", tailnet, 450, 322, 26),
  ];
  const links: Link[] = [
    { from: "internet-box", to: "tunnel-box", points: [[220, 75], [290, 75]], dashed: false },
    { from: "tunnel-box", to: "joseph-box", points: [[330, 110], [330, 210]], dashed: false },
    { from: "joseph-box", to: "jotaro-box", points: [[370, 355], [530, 355]], dashed: true },
  ];
  return { boxes, labels, links };
}
