export type Saved = { deploys: number; savedAt: string };
export const LOCAL_GAP: URL;
export function newestSaved<T extends { savedAt: string }>(local: T | undefined, committed: T): T;
export function nextSaved(reading: { live: boolean; deploys: number }, best: Saved, now: string): Saved;
