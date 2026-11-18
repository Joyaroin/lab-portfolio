import { describe, it, expect, vi } from "vitest";
import { readLastWatched, LAST_WATCHED_MAX, LAST_WATCHED_TIMEOUT_MS, type LastWatched } from "./last-watched";

const LINK = "https://share.example.test/last/abc";
const NOTHING: LastWatched = { show: false };
const title = (t: string): LastWatched => ({ show: true, title: t });

/** A faked fetch answering `body` with the given status and content type (MediaSafe sends text/plain; charset=utf-8). */
const answer =
  (body: string, init: { status?: number; type?: string | null } = {}): typeof fetch =>
  async () => {
    const type = init.type === undefined ? "text/plain; charset=utf-8" : init.type;
    // A string body makes Response add text/plain itself, so bytes stand for "no content type".
    const payload = type === null ? new TextEncoder().encode(body) : body;
    return new Response(payload, { status: init.status ?? 200, headers: type === null ? {} : { "Content-Type": type } });
  };

const hang: typeof fetch = (_url, init) =>
  new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));

describe("a good answer", () => {
  it("is the title, sent as text/plain; charset=utf-8", async () => {
    expect(await readLastWatched(answer("Dune: Part Two"), LINK)).toEqual(title("Dune: Part Two"));
  });
  it("reads only the media type, whatever its parameters or case", async () => {
    for (const type of ["text/plain", "text/plain; charset=utf-8", "TEXT/PLAIN;charset=UTF-8", "text/plain ; format=flowed"]) {
      expect(await readLastWatched(answer("Heat", { type }), LINK), type).toEqual(title("Heat"));
    }
  });
  it("asks the link it was given", async () => {
    const seen: unknown[] = [];
    await readLastWatched(async (url) => { seen.push(url); return new Response("x", { headers: { "Content-Type": "text/plain" } }); }, LINK);
    expect(seen).toEqual([LINK]);
  });
  it("trims surrounding whitespace", async () => {
    expect(await readLastWatched(answer("  \t Heat \n"), LINK)).toEqual(title("Heat"));
  });
  it("keeps spaces inside the title", async () => {
    expect(await readLastWatched(answer("The  Third   Man"), LINK)).toEqual(title("The  Third   Man"));
  });
});

describe("show nothing", () => {
  it("for a non-OK answer", async () => {
    for (const status of [204, 301, 404, 429, 500]) {
      expect(await readLastWatched(answer("Heat", { status }), LINK), String(status)).toEqual(NOTHING);
    }
  });
  it("for a failed fetch", async () => {
    expect(await readLastWatched(async () => { throw new TypeError("offline"); }, LINK)).toEqual(NOTHING);
  });
  it("for a body that cannot be read", async () => {
    const broken: typeof fetch = async () =>
      ({ ok: true, status: 200, headers: new Headers({ "Content-Type": "text/plain" }), text: async () => { throw new Error("cut off"); } }) as unknown as Response;
    expect(await readLastWatched(broken, LINK)).toEqual(NOTHING);
  });
  it("for a content type other than text/plain", async () => {
    for (const type of ["application/json", "text/html", "text/plain-ish", null]) {
      expect(await readLastWatched(answer("Heat", { type }), LINK), String(type)).toEqual(NOTHING);
    }
  });
  it("for an empty body, or one of only whitespace", async () => {
    expect(await readLastWatched(answer(""), LINK)).toEqual(NOTHING);
    expect(await readLastWatched(answer(" \n\t "), LINK)).toEqual(NOTHING);
  });
  it("for a body with a line break", async () => {
    for (const body of ["Heat\nCollateral", "Heat\r\nCollateral", "Heat\rX", "Heat\u2028X", "Heat\u2029X"]) {
      expect(await readLastWatched(answer(body), LINK), JSON.stringify(body)).toEqual(NOTHING);
    }
  });
  it("for a body with a control character", async () => {
    for (const body of ["He\u0000at", "He\u0007at", "He\tat", "He\u001bat", "He\u007fat", "He\u0085at"]) {
      expect(await readLastWatched(answer(body), LINK), JSON.stringify(body)).toEqual(NOTHING);
    }
  });
});

describe("the cap", () => {
  it("is 80 code points, a constant the tests build their titles from", () => {
    expect(LAST_WATCHED_MAX).toBe(80);
  });
  it("accepts 1 and the cap, refuses 0 and one over", async () => {
    for (const [n, shown] of [[1, true], [LAST_WATCHED_MAX, true], [0, false], [LAST_WATCHED_MAX + 1, false]] as const) {
      const body = "a".repeat(n);
      expect(await readLastWatched(answer(body), LINK), `${n} characters`).toEqual(shown ? title(body) : NOTHING);
    }
  });
  it("counts code points, not UTF-16 units: a title of characters outside the BMP", async () => {
    const at = "\u{1F3AC}"; // clapper board, 2 UTF-16 units, 1 code point
    expect(at.length).toBe(2);
    for (const [n, shown] of [[1, true], [LAST_WATCHED_MAX, true], [LAST_WATCHED_MAX + 1, false]] as const) {
      const body = at.repeat(n);
      expect(await readLastWatched(answer(body), LINK), `${n} code points`).toEqual(shown ? title(body) : NOTHING);
    }
  });
  it("counts the trimmed body, not the whitespace around it", async () => {
    const body = "a".repeat(LAST_WATCHED_MAX);
    expect(await readLastWatched(answer(`  ${body}\n`), LINK)).toEqual(title(body));
  });
});

describe("markup", () => {
  it("comes back as the same plain string, never parsed", async () => {
    expect(await readLastWatched(answer("<b>x</b>"), LINK)).toEqual(title("<b>x</b>"));
    expect(await readLastWatched(answer("Tom & Jerry &amp; <script>1</script>"), LINK)).toEqual(title("Tom & Jerry &amp; <script>1</script>"));
  });
});

describe("the timeout", () => {
  it("shows nothing when the call hangs past a timeout passed in", async () => {
    vi.useFakeTimers();
    try {
      const pending = readLastWatched(hang, LINK, 3000);
      await vi.advanceTimersByTimeAsync(3000);
      expect(await pending).toEqual(NOTHING);
    } finally {
      vi.useRealTimers();
    }
  });
  // The read gets 5 s, as the gap does (ADR-0003). Written as literals, so changing the default fails this.
  it("waits 5 s by default: still waiting at 4999 ms, show nothing at 5000 ms", async () => {
    vi.useFakeTimers();
    try {
      let result: unknown;
      readLastWatched(hang, LINK).then((r) => (result = r));
      await vi.advanceTimersByTimeAsync(4999);
      expect(result, "gave up before 5 s").toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(result).toEqual(NOTHING);
    } finally {
      vi.useRealTimers();
    }
  });
  it("shows nothing when the body stalls after the headers", async () => {
    vi.useFakeTimers();
    try {
      const stalled: typeof fetch = async (_url, init) => {
        const body = new ReadableStream({
          start(c) {
            init?.signal?.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
          },
        });
        return new Response(body, { status: 200, headers: { "Content-Type": "text/plain" } });
      };
      const pending = readLastWatched(stalled, LINK);
      await vi.advanceTimersByTimeAsync(LAST_WATCHED_TIMEOUT_MS);
      expect(await pending).toEqual(NOTHING);
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not leave a timer running after an answer", async () => {
    vi.useFakeTimers();
    try {
      await readLastWatched(answer("Heat"), LINK);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
