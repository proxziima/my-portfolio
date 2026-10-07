# CI/CD playbook: adopting this setup in another project

This guide is for setting up, in another repository, the CI/CD this repository uses. It covers the architecture, every building block (with the files to copy), the one-time settings, a rollout order, and the pitfalls we hit, each with its fix.

This repository is the reference implementation. Its day-to-day guide is [ci-cd.md](ci-cd.md), and the design records are in `docs/superpowers/specs/2026-10-05-ci-cd-automation-design.md` and `docs/superpowers/specs/2026-10-06-versioned-releases-design.md`.

## 1. What you get

- **Pull requests check only what they touch.** A PR runs the checks for the packages it changes, and for everything that depends on them. A change to shared config checks everything.
- **One required check.** An aggregator job, `ci-ok`, is the only check branch protection needs. It stays meaningful when unaffected jobs are skipped.
- **Every shipped artifact is gated:**
  - code: types, lint, tests with coverage;
  - generated files and database migrations: drift checks;
  - Docker images: they must build;
  - the client bundle: no secrets in it;
  - end-to-end: Playwright against a throwaway backend;
  - AI agent evals, if you have an agent.
- **Security on every PR and weekly:** CodeQL (your code and your workflows), dependency review, and gitleaks secret scanning.
- **Versioned releases.** Merging the release PR that release-please maintains produces a semver tag, a GitHub Release with notes and a `CHANGELOG.md`.
- **Production runs only releases.** A release publishes images tagged with its version and triggers the deploy. A smoke test then waits until production reports that exact version. To roll back, pin an older version tag.
- **Hygiene:** path-based PR labels, grouped weekly Dependabot updates, a ruleset on `main`, SHA-pinned actions and least-privilege tokens.

## 2. Architecture

```
pull_request (into main/develop) ─┐
push (main, develop) ─────────────┤
                                  ▼
                              changes ── decides what to check (affected packages)
                                  │
   ┌──────────┬────────┬──────────┼──────────┬──────────┬──────────────┐
  repo      verify   drift     agents      bundle      e2e      docker (matrix)
 (lint CI, (types,  (migrations, (agent    (no secrets  (Playwright  (each affected
  compose)  lint,    generated   evals)     in client)   + throwaway  image builds)
            tests)   files)                              backend)
   └──────────┴────────┴──────────┼──────────┴──────────┴──────────────┘
                                  ▼
                                ci-ok  ◄── the only required check
                                  │
                    (push to main only)
                                  ▼
                               release ── release-please: maintains the release PR;
                                  │        when it's merged, tags vX.Y.Z and creates the GitHub Release
                        (only if a release was created)
                                  ▼
                               publish ── builds and pushes the images: <version>, latest, sha-<short>
                                  ▼
                               deploy ─── calls the hosting platform's deploy hook, then the
                                          smoke test waits for /api/health to report <version>

side workflows: security.yml (CodeQL, dependency review, gitleaks), pr.yml (labels), Dependabot
```

The release and deploy live in the same workflow as the gates on purpose:
- tags, releases and PRs created with the built-in `GITHUB_TOKEN` don't trigger other workflows, so a separate tag-triggered workflow would never run;
- a release can only be cut from a commit whose gates passed.

## 3. Prerequisites and assumptions

| Area | This repo | If yours differs |
| --- | --- | --- |
| Monorepo tool | Turborepo 2.11+ | Nx: use `nx affected` / `nx show projects --affected` in the `changes` script. Single package: drop `changes` and run everything. |
| Package manager | Bun | pnpm or npm: change the `setup` composite action (cache path, install command). |
| Runtime | Node 24 | Pin your version in `setup`. |
| Tests | Vitest (v8 coverage), Playwright, `bun:test` for CI scripts | Any runner that can write a coverage summary (`json-summary`). |
| Images | Docker, one per deployable app, built from the repo root | No containers: drop `docker` and `publish`; `deploy` triggers your platform instead. |
| Registry | GHCR (`ghcr.io/<owner>/<repo>-<service>`) | Any registry: change `docker/login-action`. |
| Hosting | Easypanel Compose service with a deploy webhook | Any platform with a deploy hook or CLI (Coolify, Dokploy, Render, Fly, k8s). Only the `deploy` step changes. |
| Commits | Conventional Commits (`feat:`, `fix:`, …) | **Required** for release-please. Adopt them before releases. |

## 4. Building blocks

Each block lists its purpose, the file to copy from this repo, and what to adapt.

### 4.1 Composite actions (`.github/actions/`)

| Action | Purpose | Adapt |
| --- | --- | --- |
| `setup` | Toolchain, install cache, task-runner cache, frozen install | Package manager, versions, cache key. Keep `hashFiles(<lockfile>)` in the turbo cache key so the cache starts fresh when dependencies change. |
| `secrets` | Random, masked throwaway secrets exported to `$GITHUB_ENV`, for jobs that boot the stack | The list of secret names your apps need. |
| `cms` | Builds, migrates, seeds and starts a throwaway backend from an empty database; logs to `ci-logs/` | Replace it with your backend's equivalent. Never point it at a real database. |

### 4.2 Affected detection (`scripts/ci/affected.ts` + test)

`changes` runs this script. It reads `turbo query affected --packages --base origin/<base>` and `git diff --name-only --no-renames -z <base>...HEAD`, and writes outputs:
- one boolean per gated workspace;
- `images`, a JSON matrix of `{service, dockerfile}`;
- `affected`, a JSON list for the report;
- `all`.

Rules:
- **Everything is checked** on push, manual and scheduled runs, and when a repo-wide file changes: the lockfile, root `package.json`, `turbo.json`, `.npmrc`, compose files, `.dockerignore`, `.github/**` or `scripts/**`.
- **It fails loudly** if a PR run has no base ref, and if turbo returns errors or an unexpected shape.

It is pure logic plus a thin CLI, with unit tests. Copy it, then edit the `WORKSPACES`, `IMAGES` and `REPO_WIDE` constants.

### 4.3 `ci.yml` jobs

| Job | Runs when | Notes |
| --- | --- | --- |
| `changes` | always | Needs `fetch-depth: 0`. Also exports `live-evals: ${{ secrets.X != '' }}`, because secrets can't be read in a job-level `if`. |
| `repo` | always | actionlint (Docker image, includes shellcheck) and `docker compose config --quiet` with the env template, for every compose file combination. |
| `verify` | always | `turbo run check-types lint $AFFECTED`, then `turbo run test $AFFECTED --concurrency=1 -- --coverage`, then the CI-script tests. Uploads the coverage summaries. |
| `drift` | backend or schema packages affected | Runs the generators (migrations with a "skip if empty" flag, generated types, the admin import map, ORM migrations), then fails on `git status --porcelain`. It runs `git add --intent-to-add .` before printing the diff, so new files show their contents. |
| `agents` | agent affected | Build plus offline evals with a scripted model, on its own Postgres service. |
| `bundle` | web affected | Builds with known fake secrets, then scans the client bundle for secret names, secret values and prompt fragments. |
| `e2e` | web or backend affected | Throwaway backend, production build of the site, Playwright. Uploads the report, traces and `ci-logs/` on failure. |
| `docker` | per affected image | `docker/build-push-action` with `push: false` and the GHA layer cache, one scope per service. |
| `report` | PRs from this repo | One sticky PR comment (marker `<!-- ci-report -->`): what was checked, the verify result, coverage per package. Uses `!cancelled()`. |
| `ci-ok` | `always()` | Fails if any needed job failed or was cancelled; skipped jobs count as passed. **The only required check.** |
| `live-evals` | push to main or manual, if the model secret exists | Real-model evals; spends credit; never gates a deploy. |
| `release` | push to main, `ci-ok` succeeded | release-please, using `secrets.RELEASE_PLEASE_TOKEN \|\| github.token`. |
| `publish` | `release.created == 'true'` | Checks out the tag. metadata-action uses `context: git`, with tags `<version>`, `latest` and `sha-`. Build arg `APP_VERSION=<version>`. |
| `deploy` | after `publish` | Uses the `production` environment. Calls the deploy webhook, or skips with a notice when it is unset. Then `scripts/ci/smoke.ts`. |

Workflow-level settings:
- `permissions: contents: read`, with per-job additions only where needed;
- concurrency `ci-${{ github.ref }}`, cancelling in progress only for PRs;
- `timeout-minutes` on every job;
- `persist-credentials: false` on every checkout.

### 4.4 Release config (`release-please-config.json`, `.release-please-manifest.json`)

- One product version (`release-type: node` on the root `package.json`, `include-component-in-tag: false`, so tags look like `v0.0.1`).
- `bump-minor-pre-major: true`, so `feat:` bumps the minor version and `fix:` the patch while below 1.0.
- The first version comes from `initial-version` with an empty manifest (`{}`). It doesn't need cleaning up later.
- `changelog-sections` shows Features, Bug Fixes and Performance, and hides chores.
- `bootstrap-sha` sets where the first changelog starts. See pitfall 12 before choosing it.

### 4.5 Production compose and images

- `docker-compose.yml` (production) uses `image: ${IMAGE_REGISTRY:-ghcr.io/<owner>}/<repo>-<svc>:${IMAGE_TAG:-latest}` with `pull_policy: always` and **no `build:`**.
- `docker-compose.build.yml` is an override that adds `build:` and `pull_policy: build`, for building from source.
- Each Dockerfile declares `ARG APP_VERSION=dev` and `ENV APP_VERSION=$APP_VERSION` **as the last instruction before `USER`**, so a new version doesn't invalidate any cached layer.
- The web app exposes `GET /api/health` → `{ ok: true, version: APP_VERSION }` with `cache-control: no-store`. It must be dynamic, not prerendered.
- Any service with unauthenticated internal routes (our agent) gets **no public domain**. The smoke test covers it indirectly: the web service waits for its health check before starting.

### 4.6 `security.yml`

- **CodeQL:** a matrix over `javascript-typescript` and `actions`, with `build-mode: none`, and a config that ignores reference or vendored paths.
- **`dependency-review-action`:** on PRs, `fail-on-severity: high`.
- **`gitleaks-action`:** `fetch-depth: 0`, `GITLEAKS_CONFIG`, and **`GITLEAKS_VERSION` pinned** (see pitfall 7).

### 4.7 `pr.yml`, `labeler.yml`, `dependabot.yml`, ruleset

- **Labeler:** `pull_request_target` (never checks out PR code), `sync-labels: true`, permissions `contents: read`, `pull-requests: write`, **`issues: write`**.
- **Dependabot:** weekly into the integration branch.
  - Ecosystems: your package manager, `github-actions` (list the composite action directories explicitly), `docker` (each Dockerfile directory) and `docker-compose`.
  - Group minor and patch updates; majors come one PR each.
  - Ignore the majors you pin deliberately: runtime base images, your package manager, databases, and `@types/node`, which must match your runtime major.
- **Ruleset** (`.github/rulesets/main.json`):
  - rules: no deletion, no force-push, PR required, required check `ci-ok` with `integration_id: 15368` (GitHub Actions);
  - admin bypass only through a pull request.

  Apply it with `gh api -X POST repos/<owner>/<repo>/rulesets --input .github/rulesets/main.json`, **after** the workflow is on `main`.

## 5. One-time settings (owner)

1. **Release token.** Create a fine-grained PAT, scoped to the repo only, with **Contents: Read and write** and **Pull requests: Read and write**. Save it as the repository secret `RELEASE_PLEASE_TOKEN`. Without it, release PRs run no CI.
2. **Environment `production`:**
   - deployment branches limited to `main`;
   - the secret `EASYPANEL_DEPLOY_WEBHOOK` (or your platform's hook);
   - the variables `PROD_WEB_URL` and `PROD_CMS_URL`.
3. **Hosting platform:** turn auto-deploy off; CI triggers deploys. Rotate the hook token if it has ever been shown anywhere, and prefer an HTTPS hook URL.
4. **Code security:** enable Dependency graph, Dependabot alerts, Secret scanning and Push protection.
5. **GHCR:** after the first publish, make each package public, or give the platform a `read:packages` token.
6. **Ruleset:** apply it after the first merge to `main`.

## 6. Rollout order

Each step is one PR; prove each one green before starting the next.

1. **Hygiene.** Delete dead workspaces and starter leftovers. Align duplicate framework versions across workspaces (see pitfall 1).
2. **Foundations:**
   - the composite `setup` action;
   - routing tests through the task runner;
   - coverage config;
   - `passThroughEnv` (see pitfall 3);
   - the affected script with its tests;
   - `ci-ok`.
3. **Gates:** drift checks first, after fixing any existing drift, then the Docker builds, the bundle scan and e2e.
4. **Security and hygiene workflows,** plus Dependabot.
5. **Production images and compose,** plus the `/api/health` version endpoint.
6. **Releases and deploy:** release-please, publish and deploy, then the smoke test.
7. **Settings and ruleset.**

Verify locally before every push:
- actionlint: the Windows binary, or the Docker image;
- the CI-script tests;
- a full-stack run: throwaway backend, production build, Playwright, and a real-browser check for a new visitor and a returning visitor.

## 7. Pitfalls we hit, and their fixes

1. **Removing workspaces changed the hoisted React version** and broke type-checking (two `@types/react` copies). Fix: one framework version across all workspaces.
2. **`turbo --affected` selected everything on PRs.** A PR checkout is a detached merge ref with only `origin/*` refs, so turbo can't find a local base branch. Fix: `"futureFlags": { "githubActionsRemoteBaseRefFallback": true }` in `turbo.json`. Verify with a remote-only ref.
3. **Turbo 2 strict env mode** silently drops undeclared variables. That made the bundle scan useless (the secrets never reached the build) and starved tests of DB URLs. Fix: `passThroughEnv` on `build` (the scanned secret names) and on `test` (the DB URLs).
4. **Wall-clock assertions failed when test suites ran in parallel.** Fix: `--concurrency=1` for tests, and make such tests compare relative cost instead of absolute milliseconds.
5. **A Playwright "ten fast clicks" test passed locally and failed in CI.** `locator.click()` waits for actionability before every click, and on a loaded runner that took up to 1.2 s per click. Fix: resolve the element's box once, then use `page.mouse.click(x, y)`. Reproduce with CDP `Emulation.setCPUThrottlingRate`.
6. **Artifacts silently missed the logs.** upload-artifact drops hidden directories (`include-hidden-files: false`). Fix: write logs to a visible directory (`ci-logs/`).
7. **The gitleaks allowlist was ignored in CI.** gitleaks-action defaults to an older gitleaks that silently drops `[[allowlists]]`. Fix: pin `GITLEAKS_VERSION` to the version you validated locally. Use narrow regexes, never broad path exemptions.
8. **The labeler failed on the first PR.** Creating missing labels needs `issues: write`.
9. **Dependency review failed on every PR.** The repository's dependency graph was off. GitHub's graph also doesn't read `bun.lock`: dependency review then sees only direct `package.json` dependencies.
10. **Release PRs opened with `GITHUB_TOKEN` run no CI,** and the ruleset then blocks them. Fix: a PAT (`RELEASE_PLEASE_TOKEN`).
11. **The release job failed with 403 "Resource not accessible by personal access token"** on `POST /git/refs`. The PAT had Contents read-only. GitHub's response header `x-accepted-github-permissions` names the missing permission.
12. **release-please walks history by commit date, not by ancestry,** and stops at the bootstrap SHA or the last release. With merge commits, work written before that point but merged after it is skipped:
    - for the first release, pick a `bootstrap-sha` older than every unreleased commit;
    - afterwards, merge the release PR right after promoting to `main`, then merge `main` back into the integration branch.
13. **"Re-run all jobs" skips publish.** A full re-run re-runs release-please, which no longer reports a new release. Use **Re-run failed jobs**.
14. **The hosting platform runs `docker compose up --build`,** so any `build:` in the production compose rebuilds on the server. Keep `build:` in the override file only.
15. **`ARG` placement busts caches.** An `ARG` in scope enters later `RUN` cache keys. Declare it last.
16. **Empty matrices.** Guard matrix jobs with `if: needs.changes.outputs.images != '[]'`. The job-level `if` is evaluated before the matrix expands.
17. **Shellcheck in actionlint:** quote optional arguments as `${VAR:+"$VAR"}`, and join lists in `jq`, not with `echo $x`.
18. **`metadata-action` `type=sha` uses `github.sha`.** Set `context: git` so tags come from the checked-out ref.
19. **Shared dev databases cross-contaminate:**
    - a durable-workflow runtime pins sessions to the snapshot path that created them, so a session started from another checkout fails after a dev cleanup;
    - a live agent on the eval database steals the eval jobs.

    Give evals an exclusive database.
20. **Windows line endings:** generators write LF, and checkouts with `autocrlf=true` show false "modified" files. Compare with `git diff --ignore-cr-at-eol`. CI on Linux is unaffected. Force LF for Dockerfiles, shell and YAML in `.gitattributes`.

## 8. Verification checklist

- [ ] The affected-script unit tests pass; a docs-only PR checks nothing, and a lockfile change checks everything.
- [ ] actionlint is clean, and `docker compose config` passes for every compose combination.
- [ ] The drift job fails on a throwaway branch with a schema change and no migration.
- [ ] All images build in the PR's `docker` job.
- [ ] The e2e suite passes on CI and locally against a production build.
- [ ] `ci-ok` is green while unaffected jobs are skipped.
- [ ] After merging to `main`, the release PR appears and its changelog contains the expected work.
- [ ] Merging the release PR produces the tag, the GitHub Release, and the images tagged `<version>`.
- [ ] The deploy smoke test sees `/api/health` report `<version>`.
- [ ] Rollback works: `IMAGE_TAG=<older version>`, then deploy.
- [ ] The ruleset is applied: direct pushes to `main` are refused, and PRs need `ci-ok`.

## 9. Files to copy from this repository

```
.github/actions/{setup,secrets,cms}/action.yml
.github/workflows/{ci,security,pr}.yml
.github/{dependabot.yml,labeler.yml}
.github/codeql/codeql-config.yml
.github/rulesets/main.json
.gitleaks.toml
release-please-config.json  .release-please-manifest.json
scripts/ci/{affected,coverage-report,smoke}.ts (+ .test.ts)
scripts/scan-client-bundle.ts (+ .test.ts)
docker-compose.yml  docker-compose.build.yml  .env.deploy.example
apps/*/Dockerfile (APP_VERSION pattern)    apps/web/app/api/health/route.ts
turbo.json (passThroughEnv, futureFlags)   vitest configs (coverage block)
docs/ci-cd.md (adapt as the target repo's runbook)
```

Pin every action to a commit SHA with a `# vX.Y.Z` comment, and let Dependabot keep the pins current. Resolve SHAs with `gh api repos/<owner>/<action>/commits/<tag> --jq .sha`.
