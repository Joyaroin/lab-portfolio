// A stand-in for a canvas 2D context in the unit tests (which run in node, with no canvas): it
// accepts any property set or method call, and records the text passed to fillText. A gradient is an object that takes colour stops.
export function recordingContext() {
  const texts: string[] = [];
  const calls: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get: (t, k: string) => {
      if (k === "fillText") return (s: string) => void texts.push(s);
      if (k in t) return t[k];
      if (k === "createRadialGradient" || k === "createLinearGradient") return () => ({ addColorStop: () => {} });
      return (...args: unknown[]) => void calls.push(`${k}(${args.join(",")})`);
    },
    set: (t, k: string, v) => { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts, calls };
}
