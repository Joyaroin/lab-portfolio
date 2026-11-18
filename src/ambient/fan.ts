import { cyclePosition } from "./phase";

// The desk fan's blades (#382, spec #335): one pure drawing, `drawFan(c, t)`. The plane is the `fan` entry of src/room-layout.json
// (0.18 m square, facing +z), the baked blade disc's size, so the canvas is square and the disc fills it; the pixels outside the disc
// are transparent (#381's `transparent depthWrite={false}` on the ambient plane material).
//
// Where the plane stands: the entry is the fan's axle, at z −1.72, inside the baked disc (a 0.04 m-thick black cylinder from z −1.73 to −1.69).
// The blades are drawn on a plane FAN_FRONT_M in front of it, at z −1.685, 5 mm in front of the disc's face, so they don't hide in it
// (`ambientSurfaces` applies the offset, with `inFront`).

export const FAN_W = 40;
export const FAN_H = 40;
/** How far the blades' plane stands in front of the `fan` entry, in metres (the entry is the axle; the baked disc's front is 0.03 in front of it). */
export const FAN_FRONT_M = 0.035;
/** One turn takes this long. At the room's 12 frames a second it is 24° a frame, so the blades read as turning, not as a wheel going backwards. */
export const FAN_CYCLE_MS = 1500;
export const FAN_BLADES = 4;
/** The blades' angle (radians, clockwise from the right, as the canvas counts) when they are stopped: the angle at STILL_T. Off the axes, as a stopped fan rests. */
export const FAN_STILL_ANGLE = Math.PI / 9;

/** Where the first blade points at time `t` (ms): the still angle at STILL_T, then a full turn every FAN_CYCLE_MS (the phase rule, `cyclePosition`). */
export const bladeAngle = (t: number) => FAN_STILL_ANGLE + (2 * Math.PI * cyclePosition(t, FAN_CYCLE_MS, 0)) / FAN_CYCLE_MS;

export function drawFan(c: CanvasRenderingContext2D, t: number) {
  const cx = FAN_W / 2, cy = FAN_H / 2, r = FAN_W / 2 - 0.5;
  c.clearRect(0, 0, FAN_W, FAN_H);
  // the dark cage the baked disc is
  c.fillStyle = "#08080a"; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#2a2c30"; c.lineWidth = 1;
  c.beginPath(); c.arc(cx, cy, r - 1, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(cx, cy, r * 0.55, 0, Math.PI * 2); c.stroke();
  // the blades: curved paddles from the hub
  const a0 = bladeAngle(t);
  c.fillStyle = "#4c5056";
  for (let k = 0; k < FAN_BLADES; k++) {
    const a = a0 + (k * 2 * Math.PI) / FAN_BLADES;
    c.save(); c.translate(cx, cy); c.rotate(a);
    c.beginPath();
    c.moveTo(r * 0.12, -r * 0.1);
    c.quadraticCurveTo(r * 0.55, -r * 0.5, r * 0.85, -r * 0.2);
    c.quadraticCurveTo(r * 0.8, r * 0.18, r * 0.12, r * 0.12);
    c.closePath(); c.fill();
    c.restore();
  }
  // the hub
  c.fillStyle = "#72777e"; c.beginPath(); c.arc(cx, cy, r * 0.14, 0, Math.PI * 2); c.fill();
}
