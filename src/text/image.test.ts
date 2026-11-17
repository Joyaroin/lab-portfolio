import { describe, it, expect } from "vitest";
import { imageBesideText, imageMounted } from "./image";

// #340: the rule that a page's image is not mounted (so not fetched) before its page has been shown. Pure, because Vitest has no DOM here;
// tests/photo.spec.ts checks the same rule in the browser, through the network.
describe("imageMounted", () => {
  it("is not mounted at boot: the page has an image but has not been shown", () => {
    expect(imageMounted(false, true, false)).toBe(false);
  });
  it("is mounted once its page is shown", () => {
    expect(imageMounted(false, true, true)).toBe(true);
  });
  it("stays mounted while the panel fades out (its page is no longer the visit's)", () => {
    expect(imageMounted(true, true, false)).toBe(true);
  });
  it("goes when the panel turns to a page with no image", () => {
    expect(imageMounted(true, false, true)).toBe(false);
    expect(imageMounted(true, false, false)).toBe(false);
  });
  it("is not mounted for a page with no image", () => {
    expect(imageMounted(false, false, true)).toBe(false);
  });
});

// #341: a project page (a stat line) with its image at the top has its lead and stat beside it; the About me portrait's page does not.
describe("imageBesideText", () => {
  it("is true for a page with an image at the top and a stat line", () => {
    expect(imageBesideText({ image: { place: "top" }, stat: "170+ merged PRs" })).toBe(true);
  });
  it("is false for the portrait's page, which has no stat line", () => {
    expect(imageBesideText({ image: { place: "top" } })).toBe(false);
  });
  it("is false for a page with no image, and for an image below the bullets", () => {
    expect(imageBesideText({ stat: "No ports open at home" })).toBe(false);
    expect(imageBesideText({ image: { place: "below" }, stat: "x" })).toBe(false);
  });
});
