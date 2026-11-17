import { test, expect } from "@playwright/test";
import { stations } from "../src/content";
import { panelOf } from "./lib/page";
import { openProject, openStation, tab } from "./lib/pages";

// #339: a page with no links draws no links row (`data-links`), so its text doesn't start a margin lower. A page with links
// draws one, holding exactly its links.
const about = stations.find((s) => s.id === "about")!;
const links = (id: string) => about.pages.find((p) => p.id === id)!.links;
const size = { width: 1280, height: 720 };

test("About me: Why I do this and Off the keyboard have no links row; Contact has one with its links", async ({ page }) => {
  await openStation(page, 3, "about", size);
  const panel = panelOf(page, "about");
  for (const id of ["why-i-do-this", "off-the-keyboard"]) {
    await tab(page, "about", id).click();
    await expect(tab(page, "about", id)).toHaveAttribute("aria-current", "page");
    await expect(panel.locator("[data-links]"), id).toHaveCount(0);
  }
  await tab(page, "about", "contact").click();
  await expect(tab(page, "about", "contact")).toHaveAttribute("aria-current", "page");
  await expect(panel.locator("[data-links]")).toHaveCount(1);
  await expect(panel.locator("[data-links] a")).toHaveText(links("contact").map((l) => l.label));
});

test("Software factory has a links row with its link", async ({ page }) => {
  await openProject(page, "software-factory", size);
  const sf = stations.find((s) => s.id === "projects")!.pages.find((p) => p.id === "software-factory")!;
  await expect(panelOf(page, "projects").locator("[data-links] a")).toHaveText(sf.links.map((l) => l.label));
});
