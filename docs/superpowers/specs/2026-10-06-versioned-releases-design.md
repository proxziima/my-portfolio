# Versioned GitHub releases

Date: 2026-10-06 · Branch: `feat/ci-cd-automation` (PR #2) · Builds on `2026-10-05-ci-cd-automation-design.md`

## Goal

Production only ever runs a tagged release. Each release has:
- a semver tag (`v0.0.1`, `v0.0.2`, `v0.1.0`…);
- a GitHub Release with notes;
- a `CHANGELOG.md` entry;
- images tagged with the same version.

The first release is `v0.0.1`.

## Decisions

- **Tool: release-please** (`googleapis/release-please-action` v5, SHA-pinned). It reads the conventional commits the repo already uses and keeps one open "release" PR against `main`. Merging that PR creates the tag and the GitHub Release. semantic-release (a release on every push) and Changesets (manual per-package files, built for npm publishing) were rejected.
- **One version for the product.** web, cms and agents ship together through one compose file. The version lives in the root `package.json` (`release-type: node`, a single package `.`). Tags have no component prefix: `v0.0.1`, not `my-portfolio-v0.0.1`.
- **First version `0.0.1`.** Use release-please's `initial-version` (verify the key against the config schema). If it doesn't exist, use another mechanism that needs no manual cleanup after the first release.
- **Bumps while below 1.0:**

  | Commit | Bump |
  | --- | --- |
  | `fix:` | patch |
  | `feat:` | minor |
  | breaking change | minor (`bump-minor-pre-major: true`) |
  | `chore`, `docs`, `test`, `ci`, `build`, `refactor` | no release by themselves |

  Going to 1.0.0 is a deliberate owner decision (a `Release-As: 1.0.0` commit footer).
- **History in the first changelog.** `bootstrap-sha` is `d2a2daa`, the newest `main` commit that is older (by commit date) than every commit not yet released. release-please walks the branch history in date order, like `git log`, and stops at the bootstrap SHA. The PR #1 merge (`2a1ed2d`) would cut that walk short: companies and CI/CD commits written before it but merged after it would be skipped. The first changelog therefore covers companies, CI/CD and the late PR #1 fixes that were committed after `d2a2daa`. v0.0.1 is the first release, so those fixes belong in it.
- **Deploy only on a release.** A push to `main` no longer deploys by itself. The order is fixed: `ci-ok` → `release` (release-please) → `publish` (only if a release was created) → `deploy`. Everything stays in `ci.yml`, for two reasons:
  - tags and releases made with the built-in token don't trigger other workflows;
  - a release is only cut from a commit whose gates passed.
- **Release PR checks.** PRs opened with the built-in `GITHUB_TOKEN` don't trigger workflows, so a release PR made that way would never report `ci-ok`, and the `main` ruleset would block it. The job uses the secret `RELEASE_PLEASE_TOKEN` (a fine-grained PAT, or a GitHub App token, with contents and pull-requests read/write on this repo) when it is set. Otherwise it falls back to `github.token`, and the owner merges the release PR through the admin bypass. Document both paths.
- **Images:**
  - `publish` tags each image with `<version>` (e.g. `0.0.1`), `latest` and `sha-<short>`; `main` is no longer used as a tag.
  - `APP_VERSION` is the version, so `/api/health` reports `0.0.1`, and the deploy smoke test waits for that exact value.
  - Rollback: set `IMAGE_TAG=<older version>` in Easypanel and deploy.
- **PR triggers.** `ci` and `security` run `pull_request` only for PRs that target `main` or `develop`.
- **Branch flow.** After a release, `main` has the release commit (version bump + changelog). Merge `main` back into `develop` (documented) so the version and changelog don't diverge.

## Out of scope

Release assets (binaries, SBOMs), per-app versions, npm publishing, and automatic `main` → `develop` back-merges.

## Verification

- `release-please-config.json` validates against release-please's published schema.
- actionlint is clean.
- After merge, CI on `main` opens the "release 0.0.1" PR. Merging it creates `v0.0.1`, the GitHub Release, the `0.0.1` images and (once the owner has set up the deploy) the deploy. These steps can only be proven on GitHub, after merge.
