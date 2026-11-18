// The Last watched read (ADR-0008): one call from the visitor's browser to a MediaSafe share link, which answers
// with the title Adham last watched. Either "here is a title to show" or "show nothing". It follows src/gap.ts,
// but with no saved value: a failed read shows nothing.
//
// This module imports nothing (at most ./content): a Playwright spec imports LAST_WATCHED_MAX from it, and
// Playwright's loader can't load a module that imports JSON (docs/agents/testing.md).

/** The longest title shown, in Unicode code points (not UTF-16 units). The one place this number is written. */
export const LAST_WATCHED_MAX = 80;

export const LAST_WATCHED_TIMEOUT_MS = 5000;

export type LastWatched = { show: true; title: string } | { show: false };

const NOTHING: LastWatched = { show: false };

// Any control character (C0, DEL, C1) or Unicode line/paragraph separator. This covers every line break.
const CONTROL = /[\p{Cc}\u2028\u2029]/u;

/** Accepts the body of an answer: trimmed, 1 to LAST_WATCHED_MAX code points, no control character. */
function accept(body: string): LastWatched {
  const title = body.trim();
  if (title === "" || CONTROL.test(title)) return NOTHING;
  if ([...title].length > LAST_WATCHED_MAX) return NOTHING;
  return { show: true, title };
}

/** Never throws: every failure, including a timeout, is "show nothing". The timeout covers the body as well as the headers. */
export async function readLastWatched(
  fetchFn: typeof fetch,
  link: string,
  timeoutMs = LAST_WATCHED_TIMEOUT_MS,
): Promise<LastWatched> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(link, { signal: controller.signal });
    if (res.status !== 200) return NOTHING;
    // Only the media type counts; "text/plain; charset=utf-8" is what MediaSafe sends.
    const mediaType = (res.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
    if (mediaType !== "text/plain") return NOTHING;
    return accept(await res.text());
  } catch {
    return NOTHING;
  } finally {
    clearTimeout(timer);
  }
}
