import { useFrame, useThree } from "@react-three/fiber";
import { createRef, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import type { Mesh, MeshBasicMaterial } from "three";
import { framingFor } from "./framing";
import type { Where } from "./where";
import { crts, spares, CRT_GLASS, PLANE_INSET, phosphorFrame } from "./crts";
import { stations } from "./content";
import { CARD_PX, drawPhosphor } from "./card";
import { canvas, texture } from "./draw";

// ---------------------------------------------------------------- CRT phosphor
// The baked glass is a flat green block. Each CRT gets a phosphor screen over it: a dark glass
// whose centre glows, scanlines and darker curved corners. While you aren't at that station it
// also carries a title card: the station's number over its name, big enough to read from the wide view. It comes
// from the content module (name, and its place in the tour for the number); no copy is held here.
// Nothing on the card moves or reads as live. The station's own text is the HTML panel pinned on
// top (Room.tsx), and the card is swapped for the clear glass while that text is showing.
// The bench TV is the Projects station's, drawn like any other station: a card, then the text on the glass.
// The three spare CRTs get the clear phosphor glass and nothing else: no card, no bezel layer, no hover glow and no click
// (a click on one is a click on the room), and it never changes.

export function Phosphor({ where }: { where: MutableRefObject<Where> }) {
  const invalidate = useThree((s) => s.invalidate);
  const screens = useMemo(() => crts.map((crt, k) => {
    const station = stations.find((s) => s.id === crt.id)!;
    const c = canvas(CARD_PX.width, CARD_PX.height);
    drawPhosphor(c, { name: station.name, number: k + 1 });
    // the same glass with no card, shown while the station's own text is on it
    const clear = canvas(CARD_PX.width, CARD_PX.height);
    drawPhosphor(clear);
    return { crt, t: texture(c), clear: texture(clear), mat: createRef<MeshBasicMaterial>(), mesh: createRef<Mesh>() };
  }), []);
  // Which screens show the clear glass now. The swap is done in a frame (below), so a change that
  // needs one is noticed here and asked for: it must not depend on the camera happening to move.
  const clearNow = useRef<boolean[]>([]);
  useEffect(() => {
    let queued = 0;
    // Looks after the camera rig has moved `where` (and after a resize), then asks for a frame if a swap is due.
    const look = () => {
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(() => {
        const framing = framingFor({ width: window.innerWidth, height: window.innerHeight });
        if (screens.some((_, k) => framing.textOnGlass(where.current, k + 1) !== !!clearNow.current[k])) invalidate();
      });
    };
    window.addEventListener("resize", look);
    return () => { cancelAnimationFrame(queued); window.removeEventListener("resize", look); };
  }, [screens, where, invalidate]);
  useFrame(({ size }) => {
    const framing = framingFor(size);
    screens.forEach((s, k) => {
      const m = s.mat.current, mesh = s.mesh.current;
      if (!m || !mesh) return;
      const clear = framing.textOnGlass(where.current, k + 1);
      clearNow.current[k] = clear;
      const map = clear ? s.clear : s.t;
      if (m.map !== map) { m.map = map; m.needsUpdate = true; }
      // While the text is on the glass, the plane runs out to the glass edge: otherwise the flat
      // baked glass shows in the gap around it as a bright rim (the card used to hide that).
      const grow = clear ? CRT_GLASS.width / (CRT_GLASS.width - PLANE_INSET) : 1;
      if (mesh.scale.x !== grow) mesh.scale.set(grow, clear ? CRT_GLASS.height / (CRT_GLASS.height - PLANE_INSET) : 1, 1);
    });
  });
  // The spares' glass: the clear phosphor, the same texture the stations show while their text is on the glass.
  // Full glass size, not inset: the baked glass must not show round it as a bright rim.
  const spare = useMemo(() => {
    const c = canvas(CARD_PX.width, CARD_PX.height);
    drawPhosphor(c);
    return texture(c);
  }, []);
  return (
    <>
      {spares.map((crt) => {
        const f = phosphorFrame(crt);
        return (
          <mesh key={crt.id} position={[...f.position]} rotation={[0, f.yaw, 0]} raycast={() => null}>
            <planeGeometry args={[CRT_GLASS.width, CRT_GLASS.height]} />
            <meshBasicMaterial map={spare} toneMapped={false} />
          </mesh>
        );
      })}
      {screens.map(({ crt, t, mat, mesh }) => {
        const f = phosphorFrame(crt);
        return (
          <mesh key={crt.id} ref={mesh} position={[...f.position]} rotation={[0, f.yaw, 0]} raycast={() => null}>
            <planeGeometry args={[CRT_GLASS.width - PLANE_INSET, CRT_GLASS.height - PLANE_INSET]} />
            <meshBasicMaterial ref={mat} map={t} toneMapped={false} />
          </mesh>
        );
      })}
    </>
  );
}
