import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { stations } from "./content";

// `make photo` prepares the page images in src/assets/. A source carries the camera model and the date taken, so
// each committed file must have no EXIF or XMP (APP1), IPTC (APP13) or comment (COM) segment.

/** Every page image: its file in src/assets/, the most its width or height may be (px), and its size cap (KB).
 *  #341 and #342 each add a row. */
const IMAGES = [
  { file: "adham.jpg", maxPx: 600, capKB: 60 }, // the About me portrait, 600 px tall
  { file: "mediasafe-library.jpg", maxPx: 1400, capKB: 200 }, // the MediaSafe page's Library screenshot (#341)
];

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

/** What is wrong with a JPEG's bytes, as a list of sentences: empty when it is fine. */
const problems = (bytes: Uint8Array, maxPx: number, capKB: number): string[] => {
  const segments = jpegSegments(bytes);
  const out: string[] = [];
  const names: Record<number, string> = { 0xe1: "an APP1 (EXIF or XMP)", 0xed: "an APP13 (IPTC)", 0xfe: "a COM (comment)" };
  for (const s of segments) if (names[s.marker]) out.push(`has ${names[s.marker]} segment`);
  for (const s of segments.filter((s) => s.marker >= 0xe0 && s.marker <= 0xef)) {
    if (s.marker !== 0xe1 && s.marker !== 0xed && Buffer.from(s.data.subarray(0, 4)).toString("latin1") !== "JFIF")
      out.push(`has an application segment that is not JFIF (marker ${s.marker.toString(16)})`);
  }
  const sof = segments.find((s) => s.marker === 0xc0 || s.marker === 0xc2);
  if (!sof) return [...out, "has no frame header"];
  const height = (sof.data[1] << 8) | sof.data[2];
  const width = (sof.data[3] << 8) | sof.data[4];
  if (sof.data[5] !== 1) out.push(`is not greyscale (${sof.data[5]} colour components)`);
  if (Math.max(width, height) > maxPx) out.push(`is ${width}x${height}, over ${maxPx} px`);
  if (bytes.length > capKB * 1024) out.push(`is ${bytes.length} bytes, over its ${capKB} KB cap`);
  return out;
};

describe("the page images", () => {
  it.each(IMAGES)("$file exists in src/assets/ and has no metadata, is greyscale and is within its caps", ({ file, maxPx, capKB }) => {
    const bytes = readFileSync(`src/assets/${file}`); // throws, so the test fails, if the file is missing
    expect(problems(bytes, maxPx, capKB)).toEqual([]);
  });
});

// #341: a page that names an image must have its row above, or the file's caps and metadata would go unchecked.
describe("the images the content names", () => {
  const named = stations.flatMap((s) => s.pages.flatMap((p) => (p.image ? [p.image.file] : [])));
  it("are some (the portrait and the MediaSafe screenshot)", () => {
    expect(named).toEqual(expect.arrayContaining(["adham.jpg", "mediasafe-library.jpg"]));
  });
  it.each(named)("%s has a row in the table of images", (file) => {
    expect(IMAGES.map((i) => i.file)).toContain(file);
  });
});

describe("the checks are not blind", () => {
  /** A small JPEG's header bytes: SOI, the given segments, a frame header and SOS, padded to `size` bytes. */
  const jpeg = (opts: { extra?: number[][]; components?: number; w?: number; h?: number; size?: number }) => {
    const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload];
    const jfif = seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0]);
    const { w = 100, h = 100, components = 1 } = opts;
    const sof = seg(0xc0, [8, h >> 8, h & 255, w >> 8, w & 255, components]);
    const head = [0xff, 0xd8, ...jfif, ...(opts.extra ?? []).flat(), ...sof, 0xff, 0xda];
    return Uint8Array.from([...head, ...new Array(Math.max(0, (opts.size ?? 0) - head.length)).fill(0)]);
  };
  const exif = [0xff, 0xe1, 0x00, 0x04, 0x45, 0x78];

  it("passes a clean greyscale JPEG within its caps", () => {
    expect(problems(jpeg({}), 600, 60)).toEqual([]);
  });
  it("finds an EXIF block", () => {
    expect(problems(jpeg({ extra: [exif] }), 600, 60)).toEqual(["has an APP1 (EXIF or XMP) segment"]);
  });
  it("finds an IPTC block and a comment", () => {
    const iptc = [0xff, 0xed, 0x00, 0x04, 0x00, 0x00];
    const com = [0xff, 0xfe, 0x00, 0x04, 0x68, 0x69];
    expect(problems(jpeg({ extra: [iptc, com] }), 600, 60)).toHaveLength(2);
  });
  it("finds a JPEG over its size cap, and over its width or height", () => {
    expect(problems(jpeg({ size: 61 * 1024 }), 600, 60)).toHaveLength(1);
    expect(problems(jpeg({ w: 601 }), 600, 60)).toHaveLength(1);
    expect(problems(jpeg({ h: 601 }), 600, 60)).toHaveLength(1);
  });
  it("finds a colour JPEG", () => {
    expect(problems(jpeg({ components: 3 }), 600, 60)).toHaveLength(1);
  });
});
