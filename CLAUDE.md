# This project

## Where things live
- `origin` is Forgejo. GitHub is a read-only public copy of `main`: never push or open anything there.
- Specs, tickets and PRs are on Forgejo. Use `tea`, as `docs/agents/issue-tracker.md` describes.
- Run `make setup` once per clone. It stops pushes to `main`.

## Checks
Which tests exist, where each runs, and what CI runs: `docs/agents/testing.md`.
`make facts` checks that every path, command and tag these docs name exists, so update a doc in the same PR as the change that makes it wrong.

## Deploys
Merging to `main` doesn't deploy: `release.yml` runs only when started by hand on `main` (Forgejo's "Run workflow", or `POST /repos/projects/lab/actions/workflows/release.yml/dispatches` with `{"ref": "main"}`), and deploys to staging once the release specs (`@timing` and `@render`) pass. PR CI runs no browser specs: the light ones run in `release.yml` after staging has moved, and a builder runs the ones it touched in its session.
A release job runs alone on the CI runner: every job starts with a gate (`scripts/runner-gate.mjs`) that waits through Forgejo's task list, as `docs/agents/testing.md` describes. The gate can't be seen running on a PR, since release jobs run only when started by hand: its unit tests are the proof.
Staging follows the `staging` branch, which only `release.yml`
moves. Production follows the `production` branch, which only the
`promote` workflow moves. Adham runs it.
Everything in `deploy/` is what Argo CD runs. Don't edit `image.tag` or `image.digest` by hand: the workflows own them.
Staging and production run the app image by its digest (`lab:<sha>@<digest>`), with the release version as a comment
next to the tag (`2026.11.20.1`: the Toronto date and a counter). The release tags the commit with that version, and
`promote` takes a version, a commit sha, or nothing for what's on staging (`scripts/deploy-image.mjs`).

## Dependency updates
Renovate, as the `renovate` user, opens one PR on Monday mornings with every non-major update; `renovate.json` extends
adham/ci's shared preset. It merges that PR itself once its CI is green, protected files included (Adham's decision on
2026-11-20), so those merges skip `merge-pr`. A major update waits on the repo's Dependency Dashboard issue until Adham ticks
it, and is never merged automatically. Actions are pinned by commit and images by digest: don't change a pin by hand,
Renovate moves them. Don't push to a Renovate branch: Renovate stops managing a PR anyone else has pushed to (`merge-ready`
skips them for that reason).

## Agent skills
- Issue tracker: `docs/agents/issue-tracker.md`
- Triage labels: `docs/agents/triage-labels.md`
- Domain docs: `docs/agents/domain.md`
