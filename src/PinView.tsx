import { useEffect } from "react";
import { stations, ui } from "./content";
import type { Visit } from "./visit";
import type { Where } from "./where";

// The numbered pins over the three stations at the overview (#293). The rule that decides whether they fit and where they stand is src/pins.ts's.
// This is their DOM, in the tour: a link to each station, after the HUD's links, so Tab reaches them after those, in tour order. It knows
// nothing of the camera (that keeps three.js out of the first screen): `PinPlacer`, in the room's canvas (src/PinPlacer.tsx), puts each
// pin over its glass every frame and says whether the window has room for all three (`data-fit`). A pin shows (src/theme.css) when the visitor is at the
// overview (`data-here`, from here) and the window has room (`data-fit`), and is out of the tab order otherwise (visibility).

/** The pins. `at` is where the visitor is: they show only at the overview (stop 0), never in a flight or at a station. `lit` is the station the
 *  pointer is on by its TV or its pin: its pin is lit. `reduced` shows and hides them with no easing. `redraw` asks the room for a frame, so
 *  `PinPlacer` places them when they mount, when the visitor arrives and when the window changes. */
export function Pins({ at, lit, reduced, visit, onPoint, redraw, win }: {
  at: Where; lit: number | null; reduced: boolean; visit: Visit; onPoint: (stop: number | null) => void; redraw: () => void;
  win: { width: number; height: number };
}) {
  const here = at.kind === "at" && at.stop === 0;
  useEffect(() => { redraw(); }, [redraw, here, win.width, win.height]);
  return (
    <div>
      {stations.map((s, i) => (
        <a key={s.id} href={`#${s.id}`} className="pin" data-pin={s.id} data-here={here ? "" : undefined} data-still={reduced ? "" : undefined}
          data-lit={lit === i + 1 ? "" : undefined}
          onClick={(e) => { e.preventDefault(); if (visit.target() === 0) visit.go(i + 1); }}
          onPointerEnter={(e) => { if (e.pointerType !== "touch") onPoint(i + 1); }} onPointerLeave={() => onPoint(null)}>
          <PinWords text={ui.pins[s.id]} />
        </a>
      ))}
    </div>
  );
}

/** "1 Work": the number in its disc, then the name. The words are one string in the content module, so the pin's name reads "1 Work". */
function PinWords({ text }: { text: string }) {
  const space = text.indexOf(" ");
  return <><span className="pin-n">{text.slice(0, space)}</span>{" "}{text.slice(space + 1)}</>;
}
