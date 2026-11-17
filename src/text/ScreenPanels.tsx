import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { markMore } from "./more";
import { imageBesideText, imageMounted } from "./image";
import { controlsFor, headingFor, type Button, type Controls, type PageStep } from "./controls";
import { stations, ui, type Diagram, type PageList, type Station } from "../content";
import type { Step } from "../walk";
import type { Visit } from "../visit";
import portraitUrl from "../assets/adham.jpg";
import libraryUrl from "../assets/mediasafe-library.jpg";
import golfUrl from "../assets/golf-day.jpg";

// Each station's text as real HTML. place.ts (run per frame by TextPins, which the room mounts)
// pins each panel to its CRT screen and sets its position, size and opacity; this file holds how it looks: green phosphor with
// fine scanlines and a curved-glass vignette, all drawn by CSS behind the text so it stays sharp.
// A panel shows the visit's page (`step`), never a page of its own: a tab, a list row, the breadcrumb's link and the Next and Back
// buttons all ask the visit to go, and the panel follows what the visit says (src/text/controls.ts holds what they say and where they go).
// When the text runs past the panel's height, a fade and a "more" hint sit at its bottom edge
// until the visitor has scrolled to the end.
// A phone on its side has a short panel (about 140 to 155 px): a page's image is left out there so the text gets the space.
// theme.css's #287 block says the same in its comment; keep the two in step.
// A page's image (Page.image in src/content.ts) names its file; this map turns the name into the file, which the content module can't import.
// Each file also has its own width and height, which the <img> carries so its box has the file's shape before it loads and nothing shifts when it does.
// Keep each in step with its file (src/photo-metadata.test.ts holds the caps; `make photo` prints the size it wrote).
const IMAGE_FILES: Record<string, { url: string; width: number; height: number }> = {
  "adham.jpg": { url: portraitUrl, width: 480, height: 600 }, // the portrait, 480 x 600 on its page
  "mediasafe-library.jpg": { url: libraryUrl, width: 972, height: 540 }, // the Library screenshot, three titles of its first row
  "golf-day.jpg": { url: golfUrl, width: 1000, height: 677 }, // the Solace team's golf day, below Off the keyboard's bullets
};
const SHORT_LANDSCAPE = "(orientation: landscape) and (max-height: 520px)";
function useShortLandscape() {
  return useSyncExternalStore(
    (notify) => { const m = window.matchMedia(SHORT_LANDSCAPE); m.addEventListener("change", notify); return () => m.removeEventListener("change", notify); },
    () => window.matchMedia(SHORT_LANDSCAPE).matches,
  );
}

export function ScreenPanels({ visit, step }: { visit: Visit; step: Step }) {
  return (
    <>
      <style>{css}</style>
      {stations.map((s) => <StationPanel key={s.id} s={s} visit={visit} step={step} />)}
    </>
  );
}

function StationPanel({ s, visit, step }: { s: Station; visit: Visit; step: Step }) {
  const ref = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The page shown is the visit's when it is at this station. Otherwise the panel keeps the page it last showed (it may be
  // fading out), and a station nobody has been to shows its first page.
  const [last, setLast] = useState(s.pages[0].id);
  const here = step.kind === "page" && step.station === s.id ? step.page : null;
  if (here && here !== last) setLast(here);
  const pageId = here ?? last;
  const page = s.pages.find((p) => p.id === pageId) ?? s.pages[0];
  const at: PageStep = { kind: "page", station: s.id, page: page.id };
  const controls = controlsFor(at);
  // A page's image (the About me portrait) is mounted once its page has been shown, and not before: every panel mounts at boot, and the
  // picture must not be fetched then. It stays while the panel fades out, and goes when the panel turns to a page with none (imageMounted).
  const image = page.image;
  const [imageOn, setImageOn] = useState(false);
  const shortLandscape = useShortLandscape();
  const wantImage = imageMounted(imageOn, !!image, here !== null);
  if (imageOn !== wantImage) setImageOn(wantImage);
  // A file that fails to load shows nothing: no broken image and no empty frame. The names that failed are kept, so it isn't retried on a revisit.
  const [failed, setFailed] = useState<string[]>([]);
  // Only the place beside the top text is drawn here. The image below the bullets (#342) and opening larger (#344) have their marked places below.
  const topImage = imageOn && !shortLandscape && image?.place === "top" && !failed.includes(image.file) ? image : null;
  // #342 (below the bullets): the same rules for the image under the bullets. Its caption goes with it: it is left out on a short landscape
  // window and when the file fails to load. The cue is worked out again when it arrives or goes (its own effect, so the line above is not edited).
  const belowImage = imageOn && !shortLandscape && image?.place === "below" && !failed.includes(image.file) ? image : null;
  useLayoutEffect(() => { if (ref.current) markMore(ref.current); }, [belowImage]);
  // On a project page (one with a stat line) the page's lead and stat sit in the column beside the image, and in the portrait framing the image
  // goes after the bullets. A page without an image, and the About me portrait's page, are drawn as before. Decided by the page, not by whether
  // the image has arrived, so the text doesn't change width when it loads or fails.
  const beside = imageBesideText(page);
  // A new page starts at its top, and the "more" cue is worked out for the new text.
  useLayoutEffect(() => { if (ref.current) { ref.current.scrollTop = 0; markMore(ref.current); } }, [page.id]);
  // An image changes the panel's height when it arrives or fails, and the room draws only on demand, so the "more" cue is worked out again
  // then: onLoad below, and here for a failure (which takes the image out). Mounting the image also comes through here.
  useLayoutEffect(() => { if (ref.current) markMore(ref.current); }, [topImage]);
  // After a tab, a row or a button the visitor's focus goes to the new page's heading, so a screen reader says where it landed.
  // The arrow keys never do this: they are not a click on one of these. Only a move the visit made at once counts.
  const refocus = useRef(false);
  useLayoutEffect(() => { if (refocus.current) { refocus.current = false; headingRef.current?.focus({ preventScroll: true }); } }, [page.id]);
  // The cue sits just above the foot, whatever height its row has (it wraps on a narrow panel).
  const footRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const panelEl = ref.current, foot = footRef.current;
    if (!panelEl) return;
    if (!foot) { panelEl.style.removeProperty("--foot-h"); return; }
    const set = () => panelEl.style.setProperty("--foot-h", `${foot.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(foot);
    return () => ro.disconnect();
  }, [controls.back?.label, controls.next?.label]);
  const go = (to: Step) => {
    visit.go(to);
    const now = visit.step();
    refocus.current = now.kind === "page" && now.station === s.id && now.page !== page.id;
  };
  return (
    <section ref={ref} tabIndex={-1} data-screen={s.id} aria-label={s.name} className="crt-panel" style={{ ...panel, visibility: "hidden" }}
      onScroll={(e) => markMore(e.currentTarget)}>
      <Crumb c={controls.crumb} go={go} />
      {/* the heading and the station's line, with the page's image beside them (above them in portrait; see theme.css) */}
      <div className="crt-top" data-beside={beside ? "true" : undefined}>
        <div className="crt-top-text">
          <h2 ref={headingRef} tabIndex={-1} data-heading style={heading}>{headingFor(at)}</h2>
          {s.line && <p data-line style={lead}>{s.line}</p>}
          {beside && page.lead && <p data-lead style={lead}>{page.lead}</p>}
          {beside && page.stat && <p data-stat style={stat}>{page.stat}</p>}
        </div>
        {topImage && IMAGE_FILES[topImage.file] && (
          <figure className="crt-photo" data-photo>
            {/* #344 (opens larger): the small image's button and the dialog it opens are drawn here, around this <img>. Nothing else edits this block. */}
            <img src={IMAGE_FILES[topImage.file].url} alt={topImage.alt} width={IMAGE_FILES[topImage.file].width} height={IMAGE_FILES[topImage.file].height} decoding="async"
              onLoad={() => { if (ref.current) markMore(ref.current); }}
              onError={() => setFailed((f) => [...f, topImage.file])} />
          </figure>
        )}
      </div>
      {controls.tabs && <Tabs tabs={controls.tabs} station={s} go={go} />}
      {/* the open page's lead: it changes when the page turns */}
      {!beside && page.lead && <p data-lead style={lead}>{page.lead}</p>}
      {!beside && page.stat && <p data-stat style={stat}>{page.stat}</p>}
      {page.list && <ProjectList list={page.list} s={s} go={go} />}
      {/* links first, so they are on screen without scrolling even in a phone's short panel */}
      {/* a page with no links draws no row, so its text doesn't start a margin lower (#339) */}
      {page.links.length > 0 && (
        <p data-links style={linkRow}>
          {page.links.map((l) => (
            <a key={l.label + l.href} href={l.href} style={link}
              {...(l.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {l.label}
            </a>
          ))}
        </p>
      )}
      {page.diagram && <DiagramFigure d={page.diagram} />}
      <ul style={list}>{page.body.map((b, i) => <li key={i} style={item}>{b}</li>)}</ul>
      {/* #342 (below the bullets): an image with place "below" and its caption are drawn here, after the bullets. Nothing else edits this block. */}
      {belowImage && IMAGE_FILES[belowImage.file] && (
        <figure className="crt-below" data-below>
          <div className="crt-below-img">
            <img src={IMAGE_FILES[belowImage.file].url} alt={belowImage.alt} width={IMAGE_FILES[belowImage.file].width} height={IMAGE_FILES[belowImage.file].height} decoding="async"
              onLoad={() => { if (ref.current) markMore(ref.current); }}
              onError={() => setFailed((f) => [...f, belowImage.file])} />
          </div>
          {belowImage.caption && <figcaption data-caption>{belowImage.caption}</figcaption>}
        </figure>
      )}
      <Foot c={controls} go={go} footRef={footRef} />
      <div className="crt-more" aria-hidden="true"><span>{ui.more}</span></div>
    </section>
  );
}

// The first line of every panel: "Monitor 1 · Work", or on a project page "~/projects / mediasafe" with "~/projects" a link back to the list.
function Crumb({ c, go }: { c: Controls["crumb"]; go: (to: Step) => void }) {
  return (
    <p data-crumb style={crumb}>
      {c.up && <a href="#projects" style={crumbLink} onClick={(e) => { e.preventDefault(); go(c.up!.to); }}>{c.up.label}</a>}
      {c.text}
    </p>
  );
}
const crumb: CSSProperties = { margin: 0, color: "#ffb347", fontSize: "0.8em", letterSpacing: "0.12em", textTransform: "uppercase" };
const crumbLink: CSSProperties = { color: "#ffb347", textDecoration: "underline" };

// Work's and About me's pages as tabs, in page order. Each is a real button; the open one is filled and marked with aria-current,
// so it never rests on colour alone (it is the only filled one, and the others are outlined).
function Tabs({ tabs, station, go }: { tabs: NonNullable<Controls["tabs"]>; station: Station; go: (to: Step) => void }) {
  return (
    <nav aria-label={ui.pageControls.tabs} data-tabs style={tabRow}>
      {tabs.map((t) => (
        <button key={t.page} type="button" className="crt-tab" data-page={t.page} aria-current={t.open ? "page" : undefined}
          onClick={() => { if (!t.open) go({ kind: "page", station: station.id, page: t.page }); }}>
          <span>{t.label}</span>
          {t.sub && <span className="crt-tab-sub">{t.sub}</span>}
        </button>
      ))}
    </nav>
  );
}
const tabRow: CSSProperties = { display: "flex", gap: 8, margin: "0.4em 0 0.7em" };

// Back and Next at the foot of the panel, each naming where it goes.
function Foot({ c, go, footRef }: { c: Controls; go: (to: Step) => void; footRef: React.RefObject<HTMLDivElement | null> }) {
  if (!c.back && !c.next) return null;
  const btn = (b: Button, kind: "back" | "next") => (
    <button type="button" className="crt-btn" data-btn={kind} onClick={() => go(b.to)}>{b.label}</button>
  );
  return (
    <div ref={footRef} className="crt-foot" data-foot>
      {c.back && btn(c.back, "back")}
      {c.next && btn(c.next, "next")}
    </div>
  );
}

// The Projects list page: a shell prompt, a row for each project (its name, tech tag and stat) and a line at the foot.
function ProjectList({ list, s, go }: { list: PageList; s: Station; go: (to: Step) => void }) {
  return (
    <div data-list>
      <p style={prompt}>{list.prompt}</p>
      <ul style={rows}>
        {list.rows.map((r) => (
          <li key={r.page} style={row}>
            <button type="button" className="crt-row" data-row={r.page} onClick={() => go({ kind: "page", station: s.id, page: r.page })}>
              <span style={rowName}>{r.name}</span> <span style={rowTag}>{r.tag}</span>
              <span style={rowStat}>{s.pages.find((p) => p.id === r.page)?.stat}</span>
            </button>
          </li>
        ))}
      </ul>
      <p style={{ ...lead, color: "#ffb347" }}>{list.foot}</p>
    </div>
  );
}
const prompt: CSSProperties = { margin: "0 0 0.5em", color: "#7dffb0" };
const rows: CSSProperties = { margin: "0 0 0.7em", padding: 0, listStyle: "none" };
const row: CSSProperties = { margin: 0 };
const rowName: CSSProperties = { fontWeight: 700, color: "#b4ffd0" };
const rowTag: CSSProperties = { fontSize: "0.8em", letterSpacing: "0.04em", color: "#ffb347" };
const rowStat: CSSProperties = { display: "block" };
const stat: CSSProperties = { margin: "0 0 0.7em", color: "#ffb347" };

// A station's diagram as a line drawing. The labels are real SVG text (selectable, scaling with the
// panel); the figure as a whole carries the plain description for a screen reader.
// Boxes and arrows size to their labels, so longer words never spill out of a box.
const BOX_H = 34, H = 62, Y = 22;
const boxWidth = (t: string) => Math.max(66, t.length * 7.4 + 18);
const arrowLen = (t: string) => Math.max(48, t.length * 5.8 + 16);
function DiagramFigure({ d }: { d: Diagram }) {
  const n = d.steps.length;
  const bw = d.steps.map(boxWidth), al = d.hops.map(arrowLen);
  const xs: number[] = [];
  let w = 0;
  d.steps.forEach((_, i) => { xs.push(w); w += bw[i] + (al[i] ?? 0); });
  return (
    <figure data-diagram style={figure}>
      <svg viewBox={`0 0 ${w} ${H}`} role="img" aria-label={d.description} style={{ width: "100%", maxWidth: w * 1.6, display: "block" }}
        fill="none" stroke="#7dffb0" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        {d.steps.map((t, i) => {
          const x = xs[i], mid = Y + BOX_H / 2;
          return (
            <g key={i}>
              <rect x={x + 1} y={Y} width={bw[i] - 2} height={BOX_H} rx={4} />
              <text x={x + bw[i] / 2} y={mid + 4} textAnchor="middle" fill="#b4ffd0" stroke="none" fontSize={13} fontFamily="inherit">{t}</text>
              {i < n - 1 && (
                <>
                  <path d={`M${x + bw[i] + 4} ${mid} H${x + bw[i] + al[i] - 5} m-5 -4 l5 4 l-5 4`} />
                  {d.hops[i] && <text x={x + bw[i] + al[i] / 2} y={mid - 7} textAnchor="middle" fill="#ffb347" stroke="none" fontSize={10} fontFamily="inherit">{d.hops[i]}</text>}
                </>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
const figure: CSSProperties = { margin: "0 0 0.7em", padding: 0 };

const css = `
.crt-panel { padding: 0.9em 1em; border: 1px solid #2f7a4d; border-radius: 14px;
  box-shadow: inset 0 0 28px rgba(0,0,0,0.75), 0 0 22px rgba(60,255,140,0.18);
  background:
  repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.22) 2px 3px),
  radial-gradient(ellipse at 50% 45%, #10391f, #04140b 70%, #010804);
  background-attachment: local; }
/* The cue adds nothing to the scrollable height (the negative top margin cancels its height), and is
   hidden with visibility (inherited, so it never counts as visible inside a hidden panel) rather than
   display: otherwise showing and hiding it changes how far the panel can scroll, and the browser moves
   the visitor's position when it hides at the end. */
.crt-more { position: sticky; bottom: -0.9em; margin: -2.6em -1em 0; height: 2.6em; visibility: hidden; display: flex;
  align-items: flex-end; justify-content: center; padding-bottom: 0.3em; pointer-events: none;
  background: linear-gradient(to bottom, rgba(4,20,11,0), rgba(4,20,11,0.97) 70%); }
.crt-more span { font-size: 0.8em; letter-spacing: 0.1em; color: #ffb347; text-shadow: 0 0 6px rgba(255,140,30,0.6); }
.crt-panel[data-more="true"] .crt-more { visibility: inherit; }
/* The panel is a column so the Back and Next row sits at its foot when the text is short, and stays on screen (sticky) when the
   text scrolls. --foot-h is that row's height, set by the panel: the "more" cue sits just above it. */
.crt-panel { display: flex; flex-direction: column; }
.crt-panel > * { flex: none; }
.crt-foot { position: sticky; bottom: -0.9em; margin: auto -1em -0.9em; padding: 0.5em 1em 0.9em; display: flex; flex-wrap: wrap; gap: 0.5em; z-index: 1;
  border-top: 1px solid rgba(125,255,176,0.2); background: #04140b; }
.crt-panel[data-glass="true"] .crt-foot { bottom: -0.6em; margin: auto -1.2em -0.6em; padding: 0.5em 1.2em 0.6em; background: #020a05; }
.crt-more { bottom: calc(var(--foot-h, 0px) - 0.9em); }
.crt-panel[data-glass="true"] .crt-more { bottom: calc(var(--foot-h, 0px) - 0.6em); }
.crt-tab, .crt-btn, .crt-row { font: inherit; color: #b4ffd0; text-shadow: inherit; cursor: pointer; text-align: left;
  background: rgba(10,40,22,0.6); border: 1px solid #2f7a4d; border-radius: 6px; }
.crt-tab { flex: 1 1 0; display: grid; padding: 0.3em 0.7em; min-width: 5.5em; }
.crt-tab-sub { font-size: 0.8em; color: #7dffb0; opacity: 0.8; }
.crt-btn { min-height: 2.2em; padding: 0.3em 0.9em; }
.crt-btn[data-btn="next"] { margin-left: auto; background: #7dffb0; color: #02140a; text-shadow: none; border-color: #7dffb0; font-weight: 700; }
.crt-row { display: block; position: relative; width: 100%; padding: 0.6em 0.5em 0.6em 1.5em; background: none; border: 0; border-bottom: 1px dashed rgba(125,255,176,0.25); border-radius: 0; }
.crt-tab:hover, .crt-btn:hover, .crt-row:hover, .crt-tab:focus-visible, .crt-btn:focus-visible, .crt-row:focus-visible { background: #0f4a28; border-color: #7dffb0; box-shadow: 0 0 10px rgba(80,255,150,0.4); }
.crt-btn[data-btn="next"]:hover, .crt-btn[data-btn="next"]:focus-visible { background: #b4ffd0; color: #02140a; }
.crt-row:hover, .crt-row:focus-visible { box-shadow: none; }
.crt-row::before { content: "▸"; position: absolute; left: 0.4em; visibility: hidden; color: #ffb347; }
.crt-row:hover::before, .crt-row:focus-visible::before { visibility: visible; }
.crt-tab:focus-visible, .crt-btn:focus-visible, .crt-row:focus-visible { outline: 2px solid #ffb347; outline-offset: 2px; }
.crt-tab[aria-current="page"] { background: #7dffb0; color: #02140a; text-shadow: none; border: 2px solid #7dffb0; cursor: default; font-weight: 700; }
.crt-tab[aria-current="page"] .crt-tab-sub { color: #0d3b23; opacity: 1; }
/* The text resolves out of the shift: it comes in from a red and cyan split that closes up, in a few
   steps like a signal locking, not a smooth fade. Until then the panel is held at opacity 0 by the
   room (still in the page). Reduced motion never gets the attribute, so its text just appears. */
.crt-panel[data-gated="resolving"] { animation: crt-resolve 0.22s steps(5, end); }
@keyframes crt-resolve {
  0% { opacity: 0; text-shadow: -4px 0 rgba(255,60,60,0.9), 4px 0 rgba(60,255,255,0.9); }
  60% { opacity: 0.8; text-shadow: -2px 0 rgba(255,60,60,0.7), 2px 0 rgba(60,255,255,0.7); }
  100% { opacity: 1; text-shadow: 0 0 5px rgba(80,255,150,0.45); }
}
.crt-panel[data-glass="true"] { background: repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.18) 2px 3px); border: 0; border-radius: 0; box-shadow: none; padding: 0.6em 1.2em; }
.crt-panel[data-glass="true"] .crt-more { margin: -2.6em -1.2em 0; height: 2.6em;
  background: linear-gradient(to bottom, rgba(2,10,5,0), rgba(2,10,5,0.95) 70%); }
`;

const panel: CSSProperties = {
  position: "fixed", top: 0, left: 0, zIndex: 5, boxSizing: "border-box", overflowY: "auto",
  color: "#b4ffd0", textShadow: "0 0 5px rgba(80,255,150,0.45)", fontSize: "1rem", lineHeight: 1.45,
  userSelect: "text", cursor: "auto", willChange: "transform",
};
const heading: CSSProperties = { margin: "0.16em 0 0.4em", fontSize: "1.25em" };
const lead: CSSProperties = { margin: "0 0 0.7em" };
const list: CSSProperties = { margin: 0, paddingLeft: "1.2em" };
const item: CSSProperties = { margin: "0 0 0.6em" };
const linkRow: CSSProperties = { margin: "0 0 0.7em", display: "flex", flexWrap: "wrap", gap: "0.3em 1em" };
const link: CSSProperties = { color: "#7dffb0", textDecoration: "underline" };
