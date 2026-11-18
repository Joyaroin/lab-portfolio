import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { stations } from "./content";
import { IMAGE_FILES } from "./text/image-files";

// `make photo` prepares the page images in src/assets/. A source carries the camera model and the date taken, so
// each committed file must have no EXIF or XMP (APP1), IPTC (APP13) or comment (COM) segment.

/** Every page image: its file in src/assets/, the most its width or height may be (px), and its size cap (KB).
 *  #341 and #342 each add a row. */
const IMAGES = [
  { file: "adham.jpg", maxPx: 600, capKB: 60 }, // the About me portrait, 600 px tall
  { file: "mediasafe-library.jpg", maxPx: 1400, capKB: 200 }, // the MediaSafe page's Library screenshot (#341)
  { file: "golf-day.jpg", maxPx: 1000, capKB: 120 }, // the Off the keyboard page's golf day photo (#342)
];

/** The marker and payload of each segment outside the scan data, and where the image ends: `end` is the index just after the
 *  EOI marker, or -1 if the file has none. Anything from `end` on is bytes the picture doesn't draw. */
const jpegStructure = (b: Uint8Array) => {
  expect(b[0]).toBe(0xff);
  expect(b[1]).toBe(0xd8); // SOI
  const segments: { marker: number; data: Uint8Array }[] = [];
  let i = 2;
  while (i + 2 <= b.length) {
    if (b[i] !== 0xff) { // the scan data's bytes: skip to the next marker
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; } // fill byte
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; } // a stuffed 0xFF, or a restart marker: still scan data
    if (marker === 0xd9) return { segments, end: i + 2 }; // EOI
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker !== 0xda) segments.push({ marker, data: b.subarray(i + 4, i + 2 + len) }); // SOS's header isn't one to check
    i += 2 + len;
  }
  return { segments, end: -1 };
};

/** A JPEG's own width and height, from its frame header. */
const frameSize = (bytes: Uint8Array) => {
  const sof = jpegStructure(bytes).segments.find((s) => s.marker === 0xc0 || s.marker === 0xc2);
  expect(sof, "has a frame header").toBeDefined();
  return { width: (sof!.data[3] << 8) | sof!.data[4], height: (sof!.data[1] << 8) | sof!.data[2] };
};

/** What is wrong with a JPEG's bytes, as a list of sentences: empty when it is fine. */
const problems = (bytes: Uint8Array, maxPx: number, capKB: number): string[] => {
  const { segments, end } = jpegStructure(bytes);
  const out: string[] = [];
  if (end === -1) out.push("has no end of image marker");
  else if (end < bytes.length) out.push(`has ${bytes.length - end} bytes after the end of the image`);
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
const named = stations.flatMap((s) => s.pages.flatMap((p) => (p.image ? [p.image.file] : [])));
describe("the images the content names", () => {
  it("are some (the portrait, the MediaSafe screenshot and the golf day photo)", () => {
    expect(named).toEqual(expect.arrayContaining(["adham.jpg", "mediasafe-library.jpg", "golf-day.jpg"]));
  });
  it.each(named)("%s has a row in the table of images", (file) => {
    expect(IMAGES.map((i) => i.file)).toContain(file);
  });
});

// #388: the panel draws each image from IMAGE_FILES (src/text/image-files.ts). A page whose image has no entry there draws none, silently,
// and an entry's width and height set the <img>'s box before it loads, so they must be the file's own.
describe("IMAGE_FILES", () => {
  it.each(named)("has an entry for %s", (file) => {
    expect(Object.keys(IMAGE_FILES)).toContain(file);
  });
  it.each(Object.entries(IMAGE_FILES))("%s's width and height are the file's own", (file, { width, height }) => {
    expect({ width, height }).toEqual(frameSize(readFileSync(`src/assets/${file}`)));
  });
  it("has no entry for an image no page names", () => {
    expect(Object.keys(IMAGE_FILES).sort()).toEqual([...new Set(named)].sort());
  });
});

describe("the checks are not blind", () => {
  /** A small JPEG's header bytes: SOI, the given segments, a frame header and SOS, zero scan data to `size` bytes, then EOI and any `after` bytes. */
  const jpeg = (opts: { extra?: number[][]; components?: number; w?: number; h?: number; size?: number; after?: number[]; eoi?: boolean }) => {
    const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload];
    const jfif = seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0]);
    const { w = 100, h = 100, components = 1 } = opts;
    const sof = seg(0xc0, [8, h >> 8, h & 255, w >> 8, w & 255, components]);
    const head = [0xff, 0xd8, ...jfif, ...(opts.extra ?? []).flat(), ...sof, ...seg(0xda, [1, 1, 0, 0, 63, 0])];
    const scan = new Array(Math.max(0, (opts.size ?? 0) - head.length - 2)).fill(0);
    return Uint8Array.from([...head, ...scan, ...(opts.eoi === false ? [] : [0xff, 0xd9]), ...(opts.after ?? [])]);
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
  it("finds bytes after the end of the image, and a missing end", () => {
    expect(problems(jpeg({ after: [0x50, 0x4b, 0x03, 0x04] }), 600, 60)).toEqual(["has 4 bytes after the end of the image"]);
    expect(problems(jpeg({ eoi: false }), 600, 60)).toEqual(["has no end of image marker"]);
  });
  it("does not take a stuffed 0xFF or a restart marker in the scan data for the end", () => {
    const b = jpeg({});
    const withScan = Uint8Array.from([...b.subarray(0, b.length - 2), 0xff, 0x00, 0xff, 0xd0, 0x12, 0xff, 0xd9]);
    expect(problems(withScan, 600, 60)).toEqual([]);
  });
  it("finds a colour JPEG", () => {
    expect(problems(jpeg({ components: 3 }), 600, 60)).toHaveLength(1);
  });
});
