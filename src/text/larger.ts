/**
 * An image opened larger (#344): which station's image is open, and the button that opened it. One image is open at most, and the
 * tour's Esc listener (src/TourView.tsx) has to know of it before it acts, so this is a store the panel and that listener share.
 *  `close()` is the visitor shutting it (Esc, Close, a click on the image): focus goes back to the button that opened it.
 *  `drop()` is the tour moving on (any move, a page turn, the image going away): it shuts with no focus change, because focus
 *  follows the visitor's new place.
 */
/** What the store needs of the button that opened an image: an element has it. */
export type Opener = { focus(options?: FocusOptions): void; isConnected: boolean };
export type Larger = {
  openId(): string | null;
  open(id: string, opener: Opener | null): void;
  close(): void;
  drop(): void;
  subscribe(listener: () => void): () => void;
};

export function createLarger(): Larger {
  let id: string | null = null;
  let opener: Opener | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  return {
    openId: () => id,
    open(next, el) { id = next; opener = el; notify(); },
    close() {
      if (id === null) return;
      const back = opener;
      id = null; opener = null;
      notify();
      if (back?.isConnected) back.focus({ preventScroll: true });
    },
    drop() { if (id === null) return; id = null; opener = null; notify(); },
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

/** The one store the app uses. */
export const larger = createLarger();

/** The largest size with the image's own shape that fits inside the box (it may be bigger than the file: the box is the panel). */
export function fitWithin(box: { width: number; height: number }, natural: { width: number; height: number }): { width: number; height: number } {
  if (box.width <= 0 || box.height <= 0 || natural.width <= 0 || natural.height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  return { width: Math.floor(natural.width * scale), height: Math.floor(natural.height * scale) };
}
