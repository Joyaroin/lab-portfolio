# Testing facts

Checked against the code on 2026-11-10, at 9e73ff7: each line confirmed against the code there, and `make facts` run. The table's "Where it runs" column and the CI and release sections were checked again on 2026-11-12, when the full suite moved to the release.

## Kinds of test
| Kind | How to select it | Where it runs |
|---|---|---|
| Unit | `npm test` | Builder and CI |
| Light browser | `make browser-light PW_ARGS=<spec>` for the specs it touched. `make browser-light` alone only for a change to shared code, through `heavy` | Builder. The release runs them as part of the full suite |
| Timing | `@timing` | Release only, before staging. In the session only to measure or break-check, through `heavy`, 1 worker. Exact durations are unit tests that pass the time in or fake the clock (`src/frames.test.ts`, `src/tear.test.ts`, `src/nixie.test.ts`, `src/meter-power.test.ts`, `src/shift/shift.test.ts`, `src/ambient/redraw.test.ts`); browser timing specs check that a play happened, its order, and the safe side of a limit |
| Heavy rendering | `@render` | Release only, before staging |

## Commands
- `make frontend`: `npm ci`, the typecheck, `npm test` and the build
- `npm run build`: runs `scripts/save-gap.mjs` and `scripts/save-commits.mjs` before the type check. Each reads GitHub anonymously with a 5 s timeout and writes a gitignored `src/*-saved.local.json`. A failed call keeps the saved file: the newer of the local and committed files by `savedAt`, so a build offline or past the rate limit still leaves a valid file. `COMMITS_API=<url>` replaces the commits URL, for the offline run: `COMMITS_API=https://invalid.example heavy npm run build`. Run builds through `heavy`
- `make integration`: `make frontend`, then the integration test
- `make browser`: the full Playwright suite. Installs browsers and system packages only in CI
- `make browser-light`: the `browser` recipe without `@timing` and `@render`. Passes `PW_ARGS` through
- `make meter`: renders the meter bar's images with a local browser that has WebGL. Run on purpose, on the Mac, like `make room`. CI does not run it. Run it through `heavy`; running it again at the same commit leaves `git status --short src/assets/meter` empty. `src/meter-layers.test.ts` checks the committed images against the layer list, and `src/meter-device.test.ts` the mapping from a reading to the layers shown
- `make resume`: builds `public/resume.pdf` from `resume/resume.tex` with tectonic. Run on the Mac; the first run downloads a TeX bundle, so it needs the network. CI does not run it. `src/resume.test.ts` checks the PDF exists and the source has no phone number
- `make og-image`: takes `public/og-image.png`, the link preview image, with a local browser that has WebGL (builds the site, serves it with `npm run preview` on `TEST_PORT`). Run on purpose, on the Mac, through `heavy`. CI does not run it. `src/page-image-tags.test.ts` checks the file exists and its PNG header's size matches the head's `og:image` width and height
- `make favicon`: makes `public/favicon.png` (48×48) and `public/apple-touch-icon.png` (180×180) from the meter's committed images in a local browser. Run on purpose, on the Mac, through `heavy`, and again after `make meter`. CI does not run it. `src/page-icon-tags.test.ts` checks each file's PNG header size and the head's icon links; `scripts/check-budget.test.mjs` checks the icon links don't count toward the first screen
- `make photo SRC=<source JPEG>`: prepares `src/assets/adham.jpg`, the About me photo (crop, greyscale, darkened edges, no metadata), with Python 3 and Pillow; `PREVIEW=<png>` also writes a phosphor-green copy for looking. Run on purpose, on the Mac. CI does not run it, and the source is never committed. `src/photo-metadata.test.ts` reads the committed JPEG's segments and checks it has no APP1, APP13 or COM segment, is greyscale, 600 px tall and at most 60 KB
- `make facts`: every path, command and tag the docs name exists
- A flash limit spec counts the tear's visible snap back (the displacement map's scale reaching 0, `tests/lib/snap.ts`), never the filter coming off. `src/tear-draw.test.ts` checks the view leaves scale 0 on its last frame, whatever the frame rate, and on its stop path (a tear cut short)
- `tests/idle.spec.ts` checks the room's idle rule. At rest, at a station, in portrait (390×844) and under reduced motion, nothing draws; at the landscape overview the ambient screens keep drawing (ADR 0007), so the `@timing` power-on test runs at a portrait size, where they hold a still frame, to see the power-on stop. Three more `@timing` tests there compare screenshots over two seconds: they change at the landscape overview (so the comparison can see the screens), and don't at a station or under reduced motion
- `tests/shift.spec.ts` records the snap back's measured time as a `snap-back-ms` test annotation and a log line, for the release browser job's report
- A browser spec can't import `src/meter-layers.ts` (Playwright's loader refuses JSON modules); `tests/device.spec.ts` reads `src/assets/meter/layers.json` itself
- `tests/boot.spec.ts`'s `slowModel` helper serves the room model from a local server and waits on CDP `Network.dataReceived` for each chunk. That server must answer only `/room.glb`: on the Mac a stray `GET /` sometimes reaches it, and taking it for the model sent later chunks to a dead response, so the wait timed out (a chunk behind, or at 0) in whole-file runs only. The slow-load test needs the whole file to show it: `heavy make browser-light PW_ARGS="tests/boot.spec.ts --repeat-each=5"`
- One spec in the session: `heavy npx playwright test tests/<spec> --workers=1`

## What CI runs
CI runs on every branch except `staging` and `production`, including `main` after each merge. It runs no browser specs except the screenshots. The builder runs the light browser specs it touched in its own session, and the full suite runs in `release.yml` before staging moves. Nothing waits for the run on `main`. With no open PR, the posting steps log that there is nothing to post and pass, except on `main`: there each failure report is added as a new comment on the standing "CI failures on main" issue (created or reopened if needed).
- `frontend`, `backend`, `integration`: the make targets of the same name
- `screenshots`: the overview plus every station, at desktop and phone size, posted to the PR
- `secret-scan`: gitleaks over the full history
- `facts`: `make facts`

## What release runs
`release.yml` runs on each merge to `main`, or by hand on `main` to try again after a flaky failure (Forgejo can't re-run one job). Staging moves only when `image` and `browser` both pass, so a commit the browser suite failed never reaches staging. Each failure is a comment on the "CI failures on main" issue, and `main` stays red until a fix or a revert merges.
- `image`: builds and pushes the image
- `browser`: the full suite, tags included, on 3 workers (`playwright.config.ts`). The runner has no GPU, so WebGL draws on Mesa's llvmpipe under Xvfb (a third of SwiftShader's CPU); `tests/webgl.spec.ts` fails it if Chromium falls back to SwiftShader
- `staging`: moves the `staging` branch to the commit, then warns if the release was slow
- The release clock runs from the release run's start (Forgejo's runs API, by the API run id, not the run number) to the end of the staging push. `scripts/release-clock.mjs` warns, as a comment on the standing "Browser job times" issue (created or reopened if needed), exactly when staging moved, the `browser` job retried no test (a test with more than one result in its Playwright JSON report, flaky or not) and the clock is over 360 s. The comment carries the clock, the browser job's load average and the runner wait in seconds. The warning step is best effort and never blocks staging. `scripts/release-clock.test.mjs` sweeps the rule over time, retried and moved; if the job's token can't read the runs API, the clock starts at the earlier of the `image` and `browser` job starts

`promote.yml` moves `production`, run by Adham.
