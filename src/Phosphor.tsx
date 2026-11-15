import { useFrame, useThree } from "@react-three/fiber";
import { createRef, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import type { Mesh, MeshBasicMaterial } from "three";
import { framingFor } from "./framing";
import type { Where } from "./where";
import { crts, spares, CRT_GLASS, PLANE_INSET, phosphorFrame } from "./crts";
import { stations } from "./content";
import { CARD_PX, drawPhosphor } from "./card";
import { canvas, texture } from "./draw";
import { drawGitlog } from "./ambient/gitlog";
import { drawTraffic } from "./ambient/traffic";
import { drawPuzzle } from "./ambient/puzzle";
import { SCREEN_H, SCREEN_W, STILL_T } from "./ambient/still";
import { createAmbientRedraw } from "./ambient/redraw";
import saved from "./commits-saved.json";

// ---------------------------------------------------------------- CRT phosphor
// The baked glass is a flat green block. Each CRT gets a phosphor screen over it: a dark glass
// whose centre glows, scanlines and darker curved corners. While you aren't at that station it
// also carries a title card: the station's number over its name, big enough to read from the wide view. It comes
// from the content module (name, and its place in the tour for the number); no copy is held here.
// Nothing on the card moves or reads as live. The station's own text is the HTML panel pinned on
// top (Room.tsx), and the card is swapped for the clear glass while that text is showing.
// The bench TV is the Projects station's, drawn like any other station: a card, then the text on the glass.
// The three spare CRTs show an ambient screen (src/ambient/, ADR 0007): the git log, the lab traffic and the security
// puzzle, each drawn into a 400×300 canvas texture. They have no card, no bezel layer, no hover glow and no click
// (a click on one is a click on the room). They redraw about 12 times a second only at the landscape overview, with no
// flight and without reduced motion (src/ambient/redraw.ts); everywhere else they hold the still frame, drawn at STILL_T.

/** What each spare CRT shows, by its id in room-layout.json. */
const AMBIENT_SCREENS: Record<string, (c: CanvasRenderingContext2D, t: number) => void> = {
  "spare-work": (c, t) => drawGitlog(c, t, saved.commits),
  "spare-home-lab": drawTraffic,
  "spare-software-factory": drawPuzzle,
};

/** The glass over an ambient screen: scanlines and darker curved corners, as the station glass has. */
function drawGlass(g: CanvasRenderingContext2D) {
  g.fillStyle = "rgba(0,0,0,0.2)";
  for (let y = 0; y < SCREEN_H; y += 5) g.fillRect(0, y, SCREEN_W, 2);
  const v = g.createRadialGradient(SCREEN_W / 2, SCREEN_H / 2, SCREEN_H * 0.35, SCREEN_W / 2, SCREEN_H / 2, SCREEN_W * 0.68);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.85)");
  g.fillStyle = v; g.fillRect(0, 0, SCREEN_W, SCREEN_H);
}

export function Phosphor({ where, reduced }: { where: MutableRefObject<Where>; reduced: boolean }) {
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
    syncRef.current(size.width, size.height, true);
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
  // The spares' screens. Full glass size, not inset: the baked glass must not show round it as a bright rim.
  // Each starts on the still frame; `draw(t)` paints frame t into its texture.
  const ambient = useMemo(() => spares.map((crt) => {
    const c = canvas(SCREEN_W, SCREEN_H), g = c.getContext("2d")!;
    const paint = (t: number) => { g.save(); AMBIENT_SCREENS[crt.id](g, t); g.restore(); g.save(); drawGlass(g); g.restore(); };
    paint(STILL_T);
    const t = texture(c);
    return { crt, t, draw: (ms: number) => { paint(ms); t.needsUpdate = true; } };
  }), []);
  // The still frame is on the glass until the timer starts, and is put back when it stops.
  const still = useRef(true);
  const redraw = useMemo(() => createAmbientRedraw(() => {
    still.current = false;
    const now = performance.now();
    ambient.forEach((a) => a.draw(now));
    invalidate();
  }), [ambient, invalidate]);
  // Starts or stops the timer for the window and where the visitor is. Called every frame (where is current by then:
  // the camera rig runs first) and after a resize, which can turn the window to portrait. It runs in a frame when it
  // can, so putting the still frame back is drawn with it; after a resize it asks for one.
  const sync = (width: number, height: number, inFrame: boolean) => {
    redraw.sync({ where: where.current, framing: framingFor({ width, height }).name, reduced });
    if (redraw.running() || still.current) return;
    ambient.forEach((a) => a.draw(STILL_T));
    still.current = true;
    if (!inFrame) invalidate();
  };
  const syncRef = useRef(sync);
  syncRef.current = sync;
  useEffect(() => {
    const onResize = () => syncRef.current(window.innerWidth, window.innerHeight, false);
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); redraw.stop(); };
  }, [redraw]);
  return (
    <>
      {ambient.map(({ crt, t }) => {
        const f = phosphorFrame(crt);
        return (
          <mesh key={crt.id} position={[...f.position]} rotation={[0, f.yaw, 0]} raycast={() => null}>
            <planeGeometry args={[CRT_GLASS.width, CRT_GLASS.height]} />
            <meshBasicMaterial map={t} toneMapped={false} />
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
