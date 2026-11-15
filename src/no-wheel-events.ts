/** Wraps a react-three-fiber event manager so its canvas never listens for the wheel.
 *  r3f recomputes its stored pointer from every event it handles, the wheel included, and a wheel event's
 *  coordinates are whole pixels while a pointermove's are fractional. So a wheel turn would nudge the pointer
 *  a sub-pixel and, through the camera's parallax, the camera. The wheel never moves the camera (the room
 *  has no wheel handlers of its own), so the canvas does not hear it. */
export function withoutWheel<S, M extends { handlers?: object }>(make: (store: S) => M): (store: S) => M {
  return (store) => {
    const manager = make(store);
    const { onWheel: _wheel, ...handlers } = (manager.handlers ?? {}) as Record<string, unknown>;
    return { ...manager, handlers };
  };
}
