import { expect, type Locator, type Page } from "@playwright/test";
import { goTo, panelOf, waitForCamera } from "./page";

// How a spec uses the controls on a station's glass: the tabs, the Projects list's rows, the breadcrumb and the Back and
// Next buttons. A spec clicks them as a visitor does; this is the one place that knows what marks each one.

/** A tab on a station's glass (Work's jobs, About me's pages), by page id. */
export const tab = (page: Page, station: string, pageId: string): Locator => panelOf(page, station).locator(`button[data-page="${pageId}"]`);
/** A row of the Projects list, by project page id. */
export const row = (page: Page, station: string, pageId: string): Locator => panelOf(page, station).locator(`button[data-row="${pageId}"]`);
/** The Next button and the Back button at the foot of a station's glass. */
export const nextButton = (page: Page, station: string): Locator => panelOf(page, station).locator('button[data-btn="next"]');
export const backButton = (page: Page, station: string): Locator => panelOf(page, station).locator('button[data-btn="back"]');
/** The breadcrumb on the first line, and the page's heading. */
export const crumb = (page: Page, station: string): Locator => panelOf(page, station).locator("[data-crumb]");
export const heading = (page: Page, station: string): Locator => panelOf(page, station).locator("[data-heading]");

/** The lead and the bullets of the page shown: the text the page is made of. */
export const shownText = async (page: Page, station: string) => [
  ...(await panelOf(page, station).locator("[data-lead]").allInnerTexts()),
  ...(await panelOf(page, station).locator("li").allInnerTexts()),
];

/** Goes to station `stop` (1..) through the HUD and waits until its text is out and the camera has arrived. */
export async function openStation(page: Page, stop: number, id: string, size?: { width: number; height: number }) {
  if (size) await page.setViewportSize(size);
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await goTo(page, stop);
  await expect(panelOf(page, id)).toHaveCSS("opacity", "1");
  await waitForCamera(page);
}

/** Opens one project's page: the Projects station, then its row on the list. */
export async function openProject(page: Page, projectId: string, size?: { width: number; height: number }) {
  await openStation(page, 2, "projects", size);
  await row(page, "projects", projectId).click();
  await expect(crumb(page, "projects")).toContainText(` / ${projectId}`);
}

/** The URL's hash now. */
export const hash = (page: Page) => page.evaluate(() => location.hash);
