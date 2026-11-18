import { cyclePosition } from "./phase";

// The rack's lights (#381): the activity lights on the two small PCs and the UPS blink in an irregular pattern. Decoration only.
// The plane is a thin strip laid over the rack's front (src/room-layout.json, `rack-lights`): its left edge is 3 cm and its right
// edge 10 cm in from the rack's centre, its top the upper PC's lights and its bottom the UPS's, so each light's place is that of
// the baked one. The strip is transparent between the lights. The still frame is all lights on and steady.

export const RACK_W = 28, RACK_H = 200;
/** Each time slot is this long, and the pattern repeats after SLOTS of them. */
export const SLOT_MS = 110, SLOTS = 96;
export const RACK_CYCLE_MS = SLOT_MS * SLOTS;
/** The slot the still frame is in: every light is on in it. */
export const STEADY_SLOT = 40;
export const RACK_STILL_POS = STEADY_SLOT * SLOT_MS + SLOT_MS / 2;

export type RackLight = { id: string; x: number; y: number; color: string; onChance: number };
/** The five lights, by where they are on the strip (x, y: 0..1 from its top left) and how often each is on. The PCs' blue lights are mostly on, their amber ones blink, the UPS is in between. */
export const RACK_LIGHTS: readonly RackLight[] = [
  { id: "pc1-power", x: 0, y: 0, color: "#4d8cff", onChance: 0.9 },
  { id: "pc1-disk", x: 3 / 14, y: 0, color: "#ffa21a", onChance: 0.5 },
  { id: "pc2-power", x: 0, y: 0.4057, color: "#4d8cff", onChance: 0.9 },
  { id: "pc2-disk", x: 3 / 14, y: 0.4057, color: "#ffa21a", onChance: 0.45 },
  { id: "ups", x: 1, y: 1, color: "#33ff4d", onChance: 0.75 },
];

/** A hash of two integers into 0..1 (the same on every machine: integer arithmetic only). */
function unit(a: number, b: number) {
  let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Whether light `i` is on in slot `slot` of the cycle: the steady slot has all on, every other is the light's own chance. */
export const lightOn = (i: number, slot: number) => slot === STEADY_SLOT || unit(i, slot) < RACK_LIGHTS[i].onChance;

/** Each light and whether it is on at time `t`. */
export function rackLights(t: number): (RackLight & { on: boolean })[] {
  const slot = Math.floor(cyclePosition(t, RACK_CYCLE_MS, RACK_STILL_POS) / SLOT_MS);
  return RACK_LIGHTS.map((l, i) => ({ ...l, on: lightOn(i, slot) }));
}

/** Draws frame `t`: clears the strip (transparent), then a disc on each light: lit and glowing, or a dark one that hides the baked light. */
export function drawRackLights(c: CanvasRenderingContext2D, t: number) {
  c.clearRect(0, 0, RACK_W, RACK_H);
  const inset = 2;
  for (const l of rackLights(t)) {
    const x = inset + l.x * (RACK_W - 2 * inset), y = inset + l.y * (RACK_H - 2 * inset);
    if (l.on) {
      const g = c.createRadialGradient(x, y, 0, x, y, 5);
      g.addColorStop(0, l.color); g.addColorStop(0.35, l.color); g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g; c.fillRect(x - 5, y - 5, 10, 10);
    } else {
      c.fillStyle = "#0b0c0b"; c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fill();
    }
  }
}
