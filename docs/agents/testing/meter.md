# Testing: the meter

The meter bar. The index is `docs/agents/testing.md`.

- A browser spec can't import `src/meter-layers.ts` (Playwright's loader refuses JSON modules); `tests/device.spec.ts` reads `src/assets/meter/layers.json` itself
