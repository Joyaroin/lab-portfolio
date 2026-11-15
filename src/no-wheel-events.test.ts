import { describe, it, expect } from "vitest";
import { withoutWheel } from "./no-wheel-events";

describe("withoutWheel", () => {
  const manager = (store: string) => ({ priority: 1, store, handlers: { onWheel: () => "w", onPointerMove: () => "m", onClick: () => "c" } });

  it("drops the wheel handler and keeps every other, so the canvas never listens for the wheel", () => {
    const m = withoutWheel(manager)("s");
    expect(Object.keys(m.handlers).sort()).toEqual(["onClick", "onPointerMove"]);
    expect(m.handlers.onPointerMove()).toBe("m");
  });

  it("passes the store and the rest of the manager through", () => {
    const m = withoutWheel(manager)("the store");
    expect(m).toMatchObject({ priority: 1, store: "the store" });
  });
});
