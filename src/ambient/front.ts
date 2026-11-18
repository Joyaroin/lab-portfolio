import type { Plane } from "./surfaces";

/** `plane` moved `metres` along its own normal (the way its face points: sin yaw cos tilt, sin tilt, cos yaw cos tilt), so a surface can stand just in
 *  front of the prop its src/room-layout.json entry names, not inside or level with it (the fan's blades, the radio's dial). Pure. */
export const inFront = (p: Plane, metres: number): Plane => ({
  ...p,
  position: [
    p.position[0] + metres * Math.sin(p.yaw) * Math.cos(p.tilt),
    p.position[1] + metres * Math.sin(p.tilt),
    p.position[2] + metres * Math.cos(p.yaw) * Math.cos(p.tilt),
  ],
});
