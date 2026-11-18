import { describe, it, expect } from "vitest";
import { content, ui, validateContent, type PageImage } from "./content";

// #340: a page's optional image. content.ts holds only words and the file's name; the panel turns the name into the file.
const good = () => structuredClone(content);
const about = (c = content) => c.stations.find((s) => s.id === "about")!;
const portraitPage = (c = content) => about(c).pages[0];
const problems = (c = good()) => validateContent(c).join("\n");

describe("a page's image", () => {
  it("is About me's first page's portrait, beside the top text", () => {
    expect(portraitPage().image).toEqual({
      file: "adham.jpg",
      alt: "Adham Sedik, smiling, in glasses and a black polo",
      place: "top",
    });
    // the full list: an image added to another page fails here, and that image's ticket adds its page to this list
    const withImage = content.stations.flatMap((s) => s.pages.filter((p) => p.image).map((p) => `${s.id}/${p.id}`));
    expect(withImage).toEqual(["projects/mediasafe", "about/why-i-do-this", "about/off-the-keyboard"]);
  });
  it("has no import of a file in the content module: the build imports that module", () => {
    expect(typeof portraitPage().image!.file).toBe("string");
  });
  it("is no longer one of the interface words", () => {
    expect(ui).not.toHaveProperty("photo");
  });

  describe("validateContent", () => {
    it("accepts an image with alt text, and one with a caption and opening larger", () => {
      const c = good();
      portraitPage(c).image = { file: "adham.jpg", alt: "Adham", caption: "Team golf day.", place: "below", larger: true } satisfies PageImage;
      expect(validateContent(c)).toEqual([]);
    });
    it.each([[""], [" "], [undefined]])("rejects an image with no alt text (%j)", (alt) => {
      const c = good();
      (portraitPage(c).image as Record<string, unknown>).alt = alt;
      expect(problems(c)).toContain("stations[2].pages[0].image.alt: missing");
    });
    it("rejects an image with no file name", () => {
      const c = good();
      (portraitPage(c).image as Record<string, unknown>).file = "";
      expect(problems(c)).toContain("stations[2].pages[0].image.file: missing");
    });
    it("rejects a place that is not beside the top text or below the bullets", () => {
      const c = good();
      (portraitPage(c).image as Record<string, unknown>).place = "left";
      expect(problems(c)).toContain("stations[2].pages[0].image.place: must be top or below");
    });
    it("checks the alt text and the caption like other text: no phone number, no private address", () => {
      const c = good();
      Object.assign(portraitPage(c).image!, { alt: "Call 613-555-0142", caption: "see http://192.168.1.5/" });
      const p = problems(c);
      expect(p).toContain("stations[2].pages[0].image.alt: looks like a phone number");
      expect(p).toContain("stations[2].pages[0].image.caption: contains a private address");
    });
    it("rejects an empty caption when one is given", () => {
      const c = good();
      portraitPage(c).image!.caption = " ";
      expect(problems(c)).toContain("stations[2].pages[0].image.caption: missing");
    });
  });
});
