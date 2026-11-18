import portraitUrl from "../assets/adham.jpg";
import libraryUrl from "../assets/mediasafe-library.jpg";
import golfUrl from "../assets/golf-day.jpg";

// A page's image (Page.image in src/content.ts) names its file; this map turns the name into the file, which the content module can't import.
// Each file also has its own width and height, which the <img> carries so its box has the file's shape before it loads and nothing shifts when it does.
// Keep each in step with its file (src/photo-metadata.test.ts reads each file's own size from its frame header and fails if they differ; it also holds the caps).
export const IMAGE_FILES: Record<string, { url: string; width: number; height: number }> = {
  "adham.jpg": { url: portraitUrl, width: 480, height: 600 }, // the portrait, 480 x 600 on its page
  "mediasafe-library.jpg": { url: libraryUrl, width: 972, height: 540 }, // the Library screenshot, three titles of its first row
  "golf-day.jpg": { url: golfUrl, width: 1000, height: 677 }, // the Solace team's golf day, below Off the keyboard's bullets
};
