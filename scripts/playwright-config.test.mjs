import { describe, it, expect, afterEach, vi } from "vitest";

async function config(file = "../playwright.config.ts") {
  vi.resetModules();
  return (await import(file)).default;
}
const workers = async () => (await config()).workers;

afterEach(() => vi.unstubAllEnvs());

describe("playwright.config workers", () => {
  it("runs one worker where TEST_PORT is set (an agent session on the Mac)", async () => {
    vi.stubEnv("TEST_PORT", "4293");
    expect(await workers()).toBe(1);
  });

  it("runs 3 workers in CI, so up to 3 jobs drawing WebGL on the runner's CPUs don't overload it", async () => {
    vi.stubEnv("TEST_PORT", "");
    vi.stubEnv("CI", "true");
    expect(await workers()).toBe(3);
  });

  it("keeps Playwright's default on a Mac without TEST_PORT", async () => {
    vi.stubEnv("TEST_PORT", "");
    vi.stubEnv("CI", "");
    expect(await workers()).toBeUndefined();
  });
});

describe("playwright configs' renderer", () => {
  for (const file of ["../playwright.config.ts", "../playwright.screenshots.config.ts"]) {
    it(`${file}: draws on llvmpipe through the full Chromium where LAB_WEBGL=llvmpipe (CI)`, async () => {
      vi.stubEnv("LAB_WEBGL", "llvmpipe");
      const { use } = await config(file);
      expect(use.channel).toBe("chromium");
      expect(use.launchOptions.args).toContain("--use-angle=gl");
    });

    it(`${file}: keeps Playwright's default browser elsewhere`, async () => {
      vi.stubEnv("LAB_WEBGL", "");
      const { use } = await config(file);
      expect(use.channel).toBeUndefined();
      expect(use.launchOptions).toBeUndefined();
    });
  }
});

describe("playwright.config retries", () => {
  const project = async (name) => (await config()).projects.find((p) => p.name === name);
  const retries = async (name) => (await project(name)).retries;

  it("retries a failed test once in CI", async () => {
    vi.stubEnv("CI", "true");
    expect(await retries("browser")).toBe(1);
  });

  it("retries nothing outside CI", async () => {
    vi.stubEnv("CI", "");
    expect(await retries("browser")).toBe(0);
  });

  it("never retries a @timing test, in CI or not: it is a limit check", async () => {
    for (const ci of ["true", ""]) {
      vi.stubEnv("CI", ci);
      expect(await retries("timing")).toBe(0);
    }
  });

  it("puts a @timing test in the timing project and every other test in the browser project, never both", async () => {
    const timing = await project("timing");
    const rest = await project("browser");
    expect("a test @timing".match(timing.grep)).toBeTruthy();
    expect("a plain test".match(timing.grep)).toBeFalsy();
    expect("a test @timing".match(rest.grepInvert)).toBeTruthy();
    expect("a test @render".match(rest.grepInvert)).toBeFalsy();
    expect("a plain test".match(rest.grepInvert)).toBeFalsy();
    expect(rest.grep).toBeUndefined();
  });

  it("keeps the screenshots config at 0 retries", async () => {
    vi.stubEnv("CI", "true");
    expect((await config("../playwright.screenshots.config.ts")).retries).toBe(0);
  });
});
