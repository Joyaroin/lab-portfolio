import { describe, it, expect, vi } from "vitest";
import { createLastWatchedStore } from "./last-watched-store";
import type { LastWatched } from "../last-watched";

const deferred = () => {
  let resolve!: (v: LastWatched) => void;
  const promise = new Promise<LastWatched>((r) => { resolve = r; });
  return { promise, resolve };
};

describe("the Last watched read's state, kept outside the panels (#369)", () => {
  it("starts with nothing to show and makes no call until it is started", () => {
    const read = vi.fn(async (): Promise<LastWatched> => ({ show: true, title: "Severance" }));
    const store = createLastWatchedStore(read);
    expect(store.get()).toEqual({ show: false });
    expect(read).not.toHaveBeenCalled();
  });

  it("starting it makes one call, and the answer is kept and announced", async () => {
    const d = deferred();
    const read = vi.fn(() => d.promise);
    const store = createLastWatchedStore(read);
    const heard = vi.fn();
    store.subscribe(heard);
    store.start();
    expect(read).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual({ show: false });
    d.resolve({ show: true, title: "Severance" });
    await d.promise;
    await Promise.resolve();
    expect(store.get()).toEqual({ show: true, title: "Severance" });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("starting it again, while the call is out or after it answered, makes no second call", async () => {
    const read = vi.fn(async (): Promise<LastWatched> => ({ show: true, title: "Severance" }));
    const store = createLastWatchedStore(read);
    store.start();
    store.start();
    await Promise.resolve();
    await Promise.resolve();
    store.start();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("keeps nothing to show when the read says so, and does not call again", async () => {
    const read = vi.fn(async (): Promise<LastWatched> => ({ show: false }));
    const store = createLastWatchedStore(read);
    const heard = vi.fn();
    store.subscribe(heard);
    store.start();
    await Promise.resolve();
    await Promise.resolve();
    store.start();
    expect(store.get()).toEqual({ show: false });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("gives the same object for the same answer (a React store must)", async () => {
    const store = createLastWatchedStore(async () => ({ show: true, title: "Severance" }));
    store.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.get()).toBe(store.get());
  });

  it("stops announcing to one that unsubscribed", async () => {
    const store = createLastWatchedStore(async () => ({ show: true, title: "Severance" }));
    const heard = vi.fn();
    store.subscribe(heard)();
    store.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(heard).not.toHaveBeenCalled();
  });
});
