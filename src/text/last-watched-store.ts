import { LAST_WATCHED_URL, readLastWatched, type LastWatched } from "../last-watched";

/**
 * The Last watched read's state (ADR-0008), kept outside StationPanel as imageMounted (./image.ts) does for images: every panel
 * mounts at boot, but the read starts the first time its page is shown, and only once per page load, so a revisit shows the same answer.
 * Until it answers, and after a failed read, there is nothing to show; no value is saved.
 */
export function createLastWatchedStore(read: () => Promise<LastWatched>) {
  let started = false;
  let answer: LastWatched = { show: false };
  const listeners = new Set<() => void>();
  return {
    /** Starts the read, once: a second call does nothing. */
    start() {
      if (started) return;
      started = true;
      void read().then((a) => {
        answer = a;
        for (const l of [...listeners]) l();
      });
    },
    get: () => answer,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

/** The one store of the page: Adham's link, read with the browser's fetch. */
export const lastWatched = createLastWatchedStore(() => readLastWatched((input, init) => fetch(input, init), LAST_WATCHED_URL));
