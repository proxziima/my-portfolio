# Versioned Releases Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Spec: `docs/superpowers/specs/2026-10-06-versioned-releases-design.md`.

**Goal:** release-please cuts semver releases (from `v0.0.1`). Production images and deploys only happen for a release.

**Architecture:** `ci.yml` keeps the gates. After `ci-ok` on a push to `main`, a `release` job runs release-please. `publish` and `deploy` run only when that job created a release, using its version.

**Pins:** `googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7 # v5.0.0`. All other pins are unchanged from the existing workflows.

---

### Task 1: release-please config

**Files:** create `release-please-config.json` and `.release-please-manifest.json`; modify root `package.json`.

1. Read the release-please config schema (https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json) and the manifest docs (https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md). Confirm each key you use exists: `release-type`, `include-component-in-tag`, `bump-minor-pre-major`, `bootstrap-sha`, `changelog-sections`, and the first-version mechanism (`initial-version`, or an equivalent).
2. Write `release-please-config.json`:
   - `$schema`;
   - `"bootstrap-sha": "2a1ed2d…"` (resolve the full SHA with `git rev-parse 2a1ed2d`);
   - `"bump-minor-pre-major": true`;
   - `"include-component-in-tag": false`;
   - `"changelog-sections"`: Features (`feat`), Bug Fixes (`fix`) and Performance (`perf`) visible; `refactor`, `build`, `ci`, `docs`, `test`, `chore` hidden;
   - `"packages": { ".": { "release-type": "node", "package-name": "my-portfolio", "changelog-path": "CHANGELOG.md", <first version = 0.0.1> } }`.
3. Write `.release-please-manifest.json` to match the first-version mechanism. With `initial-version` that is `{}`; follow the docs for anything else.
4. Add `"version": "0.0.0"` to the root `package.json`, right after `"name"`.
5. Validate the config against the schema. Fetch the schema and check it with a small Bun script that uses `ajv` (from the scratchpad, not added to the repo), or check each key by reading the schema. Report how you validated it.
6. Commit: `build: release-please config for one product version, starting at 0.0.1`.

### Task 2: release, publish and deploy in ci.yml; PR trigger filter

**Files:** modify `.github/workflows/ci.yml` and `.github/workflows/security.yml`.

1. In both workflows, change `pull_request:` to `pull_request:\n    branches: [main, develop]`.
2. Add a `release` job to `ci.yml`:
   - `needs: [ci-ok]`, `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`;
   - `permissions: { contents: write, pull-requests: write }`.
   - The step uses the pinned release-please action with `token: ${{ secrets.RELEASE_PLEASE_TOKEN || github.token }}`, `config-file: release-please-config.json` and `manifest-file: .release-please-manifest.json`.
   - Job outputs: `created: ${{ steps.release.outputs.release_created }}`, `version: ${{ steps.release.outputs.version }}` and `tag: ${{ steps.release.outputs.tag_name }}`.
   - Check these output names in the v5 README before using them.
   - Comment: why the PAT exists (PRs opened with GITHUB_TOKEN don't trigger CI, so the `ci-ok` check never reports), and the fallback.
3. `publish`:
   - `needs: [changes, release]` and `if: needs.release.outputs.created == 'true'`.
   - It checks out the release tag (`ref: ${{ needs.release.outputs.tag }}`).
   - metadata-action tags: `type=raw,value=${{ needs.release.outputs.version }}`, `type=raw,value=latest` and `type=sha,prefix=sha-`. Remove the `main` tag.
   - `build-args: APP_VERSION=${{ needs.release.outputs.version }}`.
4. `deploy`:
   - `needs: [release, publish]`.
   - `EXPECTED_VERSION: ${{ needs.release.outputs.version }}`.
   - The notice text says images for `<version>` were published.
5. `live-evals`: unchanged.
6. Run actionlint (PowerShell `& "$env:TEMP\actionlint\actionlint.exe" -color`; download v1.7.12 as in the CI/CD plan if it's missing) and parse the YAML with Bun.
7. Commit: `ci: releases are cut by release-please after green main; images and deploys follow the release`.

### Task 3: docs

**Files:** modify `docs/ci-cd.md`, `docs/deploy-easypanel.md`, `.env.deploy.example`, `README.md` and `docker-compose.yml` (header comment only).

1. `docs/ci-cd.md`:
   - Replace the `publish` and `deploy` rows: they now follow `release`. Add a `release` row.
   - Add a "Releases" section covering:
     - conventional commits, and the bump table from the spec;
     - the release PR, which you merge to ship;
     - the tag, the GitHub Release and `CHANGELOG.md`;
     - the image tags;
     - `Release-As: 1.0.0` to go to 1.0;
     - merging `main` back into `develop` after a release.
   - One-time setup: add the `RELEASE_PLEASE_TOKEN` step (fine-grained PAT on this repo with Contents read/write and Pull requests read/write; store it as a repository secret). Explain the fallback.
   - Fix the rollback text: `IMAGE_TAG=<older version>`.
   - Fix the PR-trigger statement: only PRs into `main`/`develop`.
2. `docs/deploy-easypanel.md`, `.env.deploy.example` and the compose header comment:
   - `IMAGE_TAG` is `latest` (the newest release) or a version like `0.0.1`, not `sha-…`.
   - "Merge into `main`" becomes "merge the release PR".
3. `README.md`, CI/CD section: one sentence on releases.
4. Commit: `docs: releases, the release PR and version-pinned rollbacks`.
