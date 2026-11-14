import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";

// `make photo` prepares the About me photo. The source carries the camera model and the date taken, so the
// committed file must have no EXIF or XMP (APP1), IPTC (APP13) or comment (COM) segment.
const PHOTO = "src/assets/adham.jpg";

/** The marker and payload of each segment before the scan data. */
const jpegSegments = (b: Uint8Array) => {
  expect(b[0]).toBe(0xff);
  expect(b[1]).toBe(0xd8); // SOI
  const out: { marker: number; data: Uint8Array }[] = [];
  let i = 2;
  while (i + 4 <= b.length) {
    expect(b[i]).toBe(0xff);
    const marker = b[i + 1];
    if (marker === 0xda) break; // SOS: the image data follows
    const len = (b[i + 2] << 8) | b[i + 3];
    out.push({ marker, data: b.subarray(i + 4, i + 2 + len) });
    i += 2 + len;
  }
  return out;
};

describe("the About me photo", () => {
  const bytes = readFileSync(PHOTO);
  const segments = jpegSegments(bytes);
  const sof = segments.find((s) => s.marker === 0xc0 || s.marker === 0xc2)!;

  it("has no EXIF, XMP, IPTC or comment segment", () => {
    const found = segments.map((s) => s.marker).filter((m) => m === 0xe1 || m === 0xed || m === 0xfe);
    expect(found).toEqual([]);
  });
  it("has no application segment but the JFIF header", () => {
    const apps = segments.filter((s) => s.marker >= 0xe0 && s.marker <= 0xef);
    for (const s of apps) expect(Buffer.from(s.data.subarray(0, 4)).toString("latin1")).toBe("JFIF");
  });
  it("is greyscale, 600 px tall and at most 60 KB", () => {
    expect(sof.data[5]).toBe(1); // one colour component
    expect((sof.data[1] << 8) | sof.data[2]).toBe(600); // height
    expect(statSync(PHOTO).size).toBeLessThanOrEqual(60 * 1024);
  });
  it("is found by the segment reader when a segment is there (the reader is not blind)", () => {
    const exif = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x45, 0x78, 0xff, 0xda]);
    expect(jpegSegments(exif).map((s) => s.marker)).toEqual([0xe1]);
  });
});
