import { describe, it, expect, vi } from "vitest";
import { createLarger, fitWithin } from "./larger";

const button = (connected = true) => ({ isConnected: connected, focus: vi.fn() });

describe("the open image's store", () => {
  it("starts with nothing open, and says which station's image is open", () => {
    const l = createLarger();
    expect(l.openId()).toBeNull();
    l.open("projects", null);
    expect(l.openId()).toBe("projects");
  });
  it("tells a listener on every change, and not after it unsubscribes", () => {
    const l = createLarger();
    const hear = vi.fn();
    const off = l.subscribe(hear);
    l.open("projects", null);
    l.close();
    expect(hear).toHaveBeenCalledTimes(2);
    off();
    l.open("projects", null);
    expect(hear).toHaveBeenCalledTimes(2);
  });
  it("close() puts focus back on the button that opened it", () => {
    const l = createLarger();
    const b = button();
    l.open("projects", b);
    l.close();
    expect(l.openId()).toBeNull();
    expect(b.focus).toHaveBeenCalledTimes(1);
  });
  it("drop() shuts it and leaves focus alone: the tour moved on", () => {
    const l = createLarger();
    const b = button();
    l.open("projects", b);
    l.drop();
    expect(l.openId()).toBeNull();
    expect(b.focus).not.toHaveBeenCalled();
  });
  it("close() leaves a button that is gone alone", () => {
    const l = createLarger();
    const b = button(false);
    l.open("projects", b);
    l.close();
    expect(b.focus).not.toHaveBeenCalled();
  });
  it("close() and drop() with nothing open do nothing", () => {
    const l = createLarger();
    const hear = vi.fn();
    l.subscribe(hear);
    l.close(); l.drop();
    expect(hear).not.toHaveBeenCalled();
  });
});

describe("fitWithin", () => {
  it("fits a wide image to a box's width", () => expect(fitWithin({ width: 486, height: 400 }, { width: 972, height: 540 })).toEqual({ width: 486, height: 270 }));
  it("fits it to a box's height when the box is wide", () => expect(fitWithin({ width: 2000, height: 270 }, { width: 972, height: 540 })).toEqual({ width: 486, height: 270 }));
  it("makes it larger than the file when the box is larger", () => expect(fitWithin({ width: 1944, height: 2000 }, { width: 972, height: 540 })).toEqual({ width: 1944, height: 1080 }));
  it("gives nothing for an empty box", () => expect(fitWithin({ width: 0, height: 10 }, { width: 972, height: 540 })).toEqual({ width: 0, height: 0 }));
});
