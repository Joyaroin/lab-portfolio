import { useFrame } from "@react-three/fiber";
import { useRef, type MutableRefObject } from "react";
import { stations } from "./content";
import { overviewPose, pinAt, pinPlaces } from "./pins";
import type { Where } from "./where";

/** Inside the room's canvas (so three.js loads with the room, not with the first screen): every frame puts each pin (src/PinView.tsx) over its glass
 *  from the camera as it is, parallax and all, as the station's text panel is (src/text), and says on each pin whether the window has room for all
 *  three (`data-fit`: `pinPlaces`'s rule, worked out once per window size). In a flight and at a station there is nothing to place. */
export function PinPlacer({ where }: { where: MutableRefObject<Where> }) {
  const last = useRef({ key: "", fit: false });
  useFrame(({ camera, size }) => {
    const key = `${size.width}x${size.height}`;
    if (key !== last.current.key) last.current = { key, fit: pinPlaces(overviewPose(size), size) !== null };
    const { fit } = last.current;
    const w = where.current;
    camera.updateMatrixWorld(); // CameraRig just moved it; project from where it is now
    stations.forEach((s, i) => {
      const el = document.querySelector<HTMLElement>(`[data-pin="${s.id}"]`);
      if (!el) return;
      if (fit && w.kind === "at" && w.stop === 0) {
        const p = pinAt(i, camera, size);
        el.style.left = `${p.x}px`;
        el.style.top = `${p.y}px`;
      }
      if ((el.dataset.fit !== undefined) !== fit) { if (fit) el.dataset.fit = ""; else delete el.dataset.fit; }
    });
  });
  return null;
}
