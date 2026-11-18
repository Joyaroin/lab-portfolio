import { props, type Prop } from "./crts";
import { clickable } from "./clickable";
import type { Step } from "./walk";
import type { Where } from "./where";

// The room's two page shortcuts (#386): a click on the rack visits Projects / Home lab, a click on the desk phone About me / Contact. Each is an
// invisible target placed over its prop from its `props` entry in src/room-layout.json (`rack` and `desk-phone-target`, the only `kind: "target"`
// entries), drawn by src/TvTargets.tsx. They are pointer shortcuts: the same pages are reached by the HUD's links and the pages' tabs.

type Win = { width: number; height: number };

/** The page each click target opens, by its id in `props`. */
export const PAGE_TARGETS: { id: string; step: Step }[] = [
  { id: "rack", step: { kind: "page", station: "projects", page: "home-lab" } },
  { id: "desk-phone-target", step: { kind: "page", station: "about", page: "contact" } },
];

/** The least window (px) the two targets are held to the 44 px rule in (the sweep in src/visit/page-targets.test.ts). */
export const TARGETS_MIN = { width: 1280, height: 720 };

/** Whether the rack and the desk phone are targets at this window: a landscape window (not narrower than it is tall: the framing's own test),
 *  at least 1280 px wide and 720 px tall. Under that, and on the portrait overview, neither takes a click (Adham, 2026-11-18). */
export const pageTargetsOn = (win: Win): boolean => win.width >= win.height && win.width >= TARGETS_MIN.width && win.height >= TARGETS_MIN.height;

/** Whether a press on the rack or the desk phone visits a page now: the gate is on, the visitor is at the overview (`clickable`) and no move
 *  to a station is running (`target`, `visit.target()`, is the stop the visitor is at or going to: a fade's second half back to the overview counts as the overview). */
export const pageTargetGoes = (win: Win, where: Where, target: number): boolean => pageTargetsOn(win) && clickable(where) && target === 0;

/** The click targets, from the layout: the entries that name a page here. */
export const pageTargets: { prop: Prop; step: Step }[] = PAGE_TARGETS.map(({ id, step }) => ({ prop: props.find((p) => p.id === id)!, step }));

/** Where a target's plane goes in the room: its centre and its rotation as Euler angles in the order YXZ (the tilt raises the plane's normal, then
 *  the yaw turns it about up). The one place the entry's yaw and tilt become a plane's pose, so the sweep measures the plane the room draws. */
export function targetFrame(p: Prop): { position: [number, number, number]; rotation: [number, number, number, "YXZ"] } {
  return { position: p.centre, rotation: [(-p.tilt * Math.PI) / 180, (p.yaw * Math.PI) / 180, 0, "YXZ"] };
}
