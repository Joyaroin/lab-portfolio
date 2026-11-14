import { ui } from "../content";
import type { SavedCommit } from "../commits";
import { SCREEN_H, SCREEN_W, STILL_T, wrap } from "./still";

// The old Work CRT: amber text, this site's real recent commits scrolling slowly up, as texture.

export const LINE_HEIGHT = 27;
/** Milliseconds per pixel of scroll: 90 is about 11 px a second. */
export const SCROLL_MS_PER_PX = 90;
/** The first line sits at this y when the list is at its top; the command line is above it. */
const FIRST_Y = 70;
/** Lines are visible between these y values, which is about ten of them. */
const TOP_Y = 30;
const BOTTOM_Y = 330;
const HASH_X = 16;
const SUBJECT_X = 106;
/** A subject longer than this is cut to this many characters and an ellipsis. The 400 px screen
 *  holds 25 of the 19 px monospace characters after the subject's x. */
export const SUBJECT_MAX = 22;

export type GitlogRow = { hash: string; subject: string; y: number };

/** A subject cut to one line: up to SUBJECT_MAX characters, then "…". */
export const cutSubject = (subject: string) =>
  subject.length <= SUBJECT_MAX + 1 ? subject : subject.slice(0, SUBJECT_MAX).trimEnd() + "…";

/** The lines on the glass at time t: the commits in order, wrapping from the last to the first,
 *  each with its y. At STILL_T the list is at its top. */
export function gitlogRows(commits: SavedCommit[], t: number): GitlogRow[] {
  if (commits.length === 0) return [];
  const offset = wrap((t - STILL_T) / SCROLL_MS_PER_PX, commits.length * LINE_HEIGHT);
  const rows: GitlogRow[] = [];
  for (let i = 0; FIRST_Y + i * LINE_HEIGHT - offset <= BOTTOM_Y; i++) {
    const y = FIRST_Y + i * LINE_HEIGHT - offset;
    if (y < TOP_Y) continue;
    const c = commits[i % commits.length];
    rows.push({ hash: c.sha7, subject: cutSubject(c.subject), y });
  }
  return rows;
}

export function drawGitlog(c: CanvasRenderingContext2D, t: number, commits: SavedCommit[]) {
  c.fillStyle = "#140b03"; c.fillRect(0, 0, SCREEN_W, SCREEN_H);
  c.font = "bold 19px Menlo, monospace"; c.fillStyle = "#ffb35c"; c.shadowColor = "#ff8a1f"; c.shadowBlur = 6;
  c.fillText(ui.ambient.gitlogCommand, HASH_X, 30);
  c.save(); c.beginPath(); c.rect(0, 42, SCREEN_W, SCREEN_H - 42); c.clip();
  for (const r of gitlogRows(commits, t)) {
    c.fillStyle = "#ffcf94"; c.fillText(r.hash, HASH_X, r.y);
    c.fillStyle = "#c98236"; c.fillText(r.subject, SUBJECT_X, r.y);
  }
  c.restore(); c.shadowBlur = 0;
}
