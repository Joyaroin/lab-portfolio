import type { Prop } from "../../src/crts";

// A prop entry's face in site axes (room-layout.json's `props`): shared by the framing sweep (src/visit/room-props.test.ts) and the line-of-sight test (src/visit/room-sight.test.ts).
export type V3 = [number, number, number];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The face's normal: the yaw turned (0 toward +z, 90 toward +x), then raised `tilt` degrees. */
export function faceNormal(p: Prop): V3 {
  const a = (p.yaw * Math.PI) / 180, t = (p.tilt * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(t), Math.sin(t), Math.cos(a) * Math.cos(t)];
}

/** A prop's four corners in site axes: its centre, half its size along the face's right and up. The face's right is level and `up` is the
 *  normal crossed with it (so a level face's up is world up). */
export function corners(p: Prop): V3[] {
  const a = (p.yaw * Math.PI) / 180, n = faceNormal(p), right: V3 = [Math.cos(a), 0, -Math.sin(a)], up = cross(n, right);
  return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([x, y]) => [0, 1, 2].map((i) => p.centre[i] + right[i] * x * p.size[0] / 2 + up[i] * y * p.size[1] / 2) as V3);
}
