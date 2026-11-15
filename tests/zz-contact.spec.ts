import { test, expect } from "@playwright/test";
import { landedAt, openTour, panelOf, waitForCamera, goTo } from "./lib/page";
import { nextButton, row } from "./lib/pages";

const out = "/private/tmp/claude-501/-Users-adhamsedik--t3-worktrees-lab-ticket-284-b6b88f187e36811a/de3a40e3-7c0f-427f-9669-9ab4ae402003/scratchpad/shots";
for (const [name, size] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]] as const) {
  test(`contact sheet ${name}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({ viewport: size, reducedMotion: "reduce", ...(name === "phone" ? { hasTouch: true, isMobile: true } : {}) });
    const page = await ctx.newPage();
    await openTour(page);
    const shot = async (id: string, file: string) => {
      await expect(panelOf(page, id)).toHaveCSS("opacity", "1");
      await waitForCamera(page);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${name}-${file}.png` });
    };
    await goTo(page, 1); await shot("work", "1-work-solace");
    await nextButton(page, "work").click(); await shot("work", "2-work-barracuda");
    await nextButton(page, "work").click(); await landedAt(page, 2); await shot("projects", "3-projects-list");
    await row(page, "projects", "software-factory").click(); await shot("projects", "4-project-software-factory");
    await nextButton(page, "projects").click(); await shot("projects", "5-project-mediasafe");
    await nextButton(page, "projects").click(); await shot("projects", "6-project-home-lab");
    await nextButton(page, "projects").click(); await landedAt(page, 3); await shot("about", "7-about-why");
    await nextButton(page, "about").click(); await shot("about", "8-about-off");
    await nextButton(page, "about").click(); await shot("about", "9-about-contact");
    await ctx.close();
  });
}
