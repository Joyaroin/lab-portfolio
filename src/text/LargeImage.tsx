import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ui } from "../content";
import { fitWithin, larger } from "./larger";

// #344: a page image that opens larger. The small image sits inside a real button; a click, Enter or Space opens it in a dialog drawn
// inside the panel, so it is on the glass with the text, and as large as the panel's visible area allows. It opens and shuts at once,
// with no animation for anyone. Which image is open is the shared store in larger.ts, because the tour's Esc listener (src/TourView.tsx)
// has to hear of it before it goes up a level. A click on the open image is a click in the station's text, so it never reaches the room.

type Shot = { url: string; width: number; height: number; alt: string };

/** The small image's button, and the dialog it opens (portalled into the panel). `children` is the small <img>. */
export function LargeImageButton({ station, panel, shot, children }: { station: string; panel: RefObject<HTMLElement | null>; shot: Shot; children: ReactNode }) {
  const open = useSyncExternalStore(larger.subscribe, larger.openId) === station;
  return (
    <>
      <button type="button" className="crt-photo-btn" aria-label={ui.imageLarger.open} onClick={(e) => larger.open(station, e.currentTarget)}>
        {children}
      </button>
      {open && panel.current && createPortal(<LargeDialog panel={panel.current} shot={shot} />, panel.current)}
    </>
  );
}

function LargeDialog({ panel, shot }: { panel: HTMLElement; shot: Shot }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const dialog = dialogRef.current, stage = stageRef.current;
    if (!dialog || !stage) return;
    // The panel scrolls, so the dialog covers the part of it the visitor sees: the panel stops scrolling while it is open (theme.css),
    // and the dialog sits at where it had scrolled to and is as tall as the panel.
    panel.setAttribute("data-larger", "true");
    dialog.style.top = `${panel.scrollTop}px`;
    const fit = () => {
      dialog.style.height = `${panel.clientHeight}px`;
      setSize(fitWithin({ width: stage.clientWidth, height: stage.clientHeight }, shot));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(panel);
    ro.observe(stage);
    closeRef.current?.focus({ preventScroll: true });
    return () => { ro.disconnect(); panel.removeAttribute("data-larger"); };
  }, [panel, shot]);
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={shot.alt} className="crt-large" tabIndex={-1}
      // Close is the only thing in the dialog to focus, so Tab stays on it. tabIndex -1 makes a click on the dialog's empty glass land
      // focus on the dialog, not on the panel behind it (where Tab would reach the page's links and scroll the panel to them), so
      // this handler still hears Tab and puts focus back on Close. (Esc is the tour's window listener, TourView.tsx.)
      onKeyDown={(e) => { if (e.key === "Tab") { e.preventDefault(); closeRef.current?.focus({ preventScroll: true }); } }}>
      <button ref={closeRef} type="button" className="crt-btn crt-large-close" onClick={() => larger.close()}>{ui.imageLarger.close}</button>
      <div ref={stageRef} className="crt-large-stage">
        {/* the dialog is named by the alt text, so the picture inside needs none of its own */}
        <div className="crt-large-shot" style={size}>
          <img src={shot.url} alt="" width={size.width || shot.width} height={size.height || shot.height} onClick={() => larger.close()} />
        </div>
      </div>
    </div>
  );
}
