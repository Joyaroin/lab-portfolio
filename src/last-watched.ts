// The Last watched read (ADR-0008): one call from the visitor's browser to a MediaSafe share link, which answers
// with the title Adham last watched. Either "here is a title to show" or "show nothing". It follows src/gap.ts,
// but with no saved value: a failed read shows nothing.
//
// This module imports nothing (at most ./content): a Playwright spec imports LAST_WATCHED_MAX from it, and
// Playwright's loader can't load a module that imports JSON (docs/agents/testing.md).

/** The longest title shown, in Unicode code points (not UTF-16 units). The one place this number is written. */
export const LAST_WATCHED_MAX = 80;

/**
 * The most of an answer's body that is taken in, in bytes. A longer body is "show nothing" and the rest is never read.
 * The longest accepted title is LAST_WATCHED_MAX code points of 4 bytes each (320), with room for whitespace around it.
 */
export const LAST_WATCHED_MAX_BYTES = 512;

export const LAST_WATCHED_TIMEOUT_MS = 5000;

export type LastWatched = { show: true; title: string } | { show: false };

const NOTHING: LastWatched = { show: false };

// Any control character (C0, DEL, C1), Unicode line/paragraph separator or invisible formatting character (Cf: bidi
// overrides and isolates, zero-width characters). The separators cover every line break.
const REFUSED = /[\p{Cc}\p{Cf}\u2028\u2029]/u;

/** Accepts the body of an answer: trimmed, 1 to LAST_WATCHED_MAX code points, no control or formatting character. */
function accept(body: string): LastWatched {
  const title = body.trim();
  if (title === "" || REFUSED.test(title)) return NOTHING;
  if ([...title].length > LAST_WATCHED_MAX) return NOTHING;
  return { show: true, title };
}

/** The body as text, read as a stream; null when it is longer than LAST_WATCHED_MAX_BYTES (the rest is never read). */
async function readBody(res: Response): Promise<string | null> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > LAST_WATCHED_MAX_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
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
    const res = await fetchFn(link, { signal: controller.signal, redirect: "error" });
    if (res.status !== 200) return NOTHING;
    // Only the media type counts; "text/plain; charset=utf-8" is what MediaSafe sends.
    const mediaType = (res.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
    if (mediaType !== "text/plain") return NOTHING;
    const body = await readBody(res);
    return body === null ? NOTHING : accept(body);
  } catch {
    return NOTHING;
  } finally {
    clearTimeout(timer);
  }
}
