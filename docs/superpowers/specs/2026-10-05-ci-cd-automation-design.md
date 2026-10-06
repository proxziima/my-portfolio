# CI/CD automation for the monorepo

Date: 2026-10-05 · Branch: `feat/ci-cd-automation` (from `develop`)

## Goal

Every workspace and every shipped artifact is checked automatically. That covers code, generated files, migrations, Docker images and the production compose file. A green `main` publishes production images to GHCR and deploys them to Easypanel, and a smoke test confirms that the new version is the one serving traffic.

"Full coverage" means every deliverable is gated. Code coverage is reported per package on each PR, report-only: there is no threshold until a baseline exists.

## Starting point

- Bun 1.3.10, Turborepo 2.11.5, Node 24. The repo is public, so Actions minutes are free and parallel jobs cost nothing.
- Workspaces: `web` (Next 16), `cms` (Payload 3.90, SQLite), `agents` (eve, Postgres), `@repo/twin`, `@repo/cms-types`, `@repo/eslint-config`, `@repo/typescript-config`. `docs` and `@repo/ui` are Turborepo starter leftovers.
- `.github/workflows/ci.yml` has one serial job that runs everything, plus `live-evals` on pushes to `main`.
- Easypanel builds the images on the server from `docker-compose.yml`. CI never builds an image, deploys aren't gated on CI, and `main` has no protection.

## Non-goals

- Changesets, npm publishing, GitHub Releases: nothing is published, and every package is `private`.
- Nx actions, random sharding, `actions/stale`, `actions/first-interaction`.
- Per-service deploys: Easypanel runs the stack as one Compose service.
- Multi-arch images: the server is amd64.
- Gating the deploy on `live-evals`: they call a real model, aren't deterministic and spend credit. They stay a signal on `main`.

## 1. Cleanup

- Delete `apps/docs` and `packages/ui`. `@repo/ui` is only used by `docs`. Delete `packages/eslint-config/react-internal.js` and its export if nothing else uses it.
- Remove `COPY apps/docs/package.json` from the three Dockerfiles. Regenerate `bun.lock`: the diff may only drop those workspaces.
- Remove the `apps/docs`/`packages/ui` row from the README.

## 2. Turborepo

- `test` runs through Turbo in every package that has tests (`twin`, `agents`, `cms`, `web`). Its `passThroughEnv` lists the variables tests read: `DATABASE_URL`, `PAYLOAD_SECRET`, `TWIN_DATABASE_URL`, `WORKFLOW_POSTGRES_URL`. Its outputs are `coverage/**`.
- `build` gets `passThroughEnv` for the secrets `scripts/scan-client-bundle.ts` checks. Under strict env mode Turbo currently strips them from the build, so the bundle scan can't find a leak.
- PRs run `turbo run check-types lint test --affected`. Pushes to `main`/`develop` and manual runs run everything. The local Turbo cache (`.turbo/cache`) is kept between runs with `actions/cache`.
- Each package's vitest config gets a v8 `coverage` block (reporters `text-summary` and `json-summary`). It only runs when CI passes `--coverage`, so local `test` is unchanged.

## 3. Affected detection: `scripts/ci/affected.ts`

A Bun script with unit tests, so the logic isn't hidden in YAML. Its inputs are the event name and the output of `turbo query affected`. Its outputs go to `$GITHUB_OUTPUT`:

| Output | Meaning |
| --- | --- |
| `web`, `cms`, `agents`, `twin` | `true` when the workspace, or a workspace it depends on, changed |
| `images` | JSON list of the image services (`web`, `cms`, `agents`) that need a build |
| `all` | `true` on push/dispatch, or when a repo-level file changed: `bun.lock`, `package.json`, `turbo.json`, `docker-compose*.yml`, `.dockerignore`, `.github/**`. This forces every output to `true`. |

## 4. Workflows

### `.github/actions/setup` (composite)

Sets up Bun 1.3.10 and Node 24, restores the Bun install cache (keyed on `bun.lock`) and the Turbo cache, then runs `bun install --frozen-lockfile`. Every job uses it.

### `.github/actions/cms` (composite)

Builds a throwaway CMS from an empty SQLite file under `.tmp/`, migrates it, seeds it and starts it on :3001, then waits for `/api/globals/profile` to answer. It never touches `payload.db`. `live-evals` and `e2e` share it. The steps move out of today's `live-evals` job unchanged.

### `ci.yml`

Triggers: `pull_request`, push to `main`/`develop`, `workflow_dispatch`. Concurrency is one group per ref, and in-progress runs are cancelled only on PRs. Each job has `timeout-minutes`, and workflow-level `permissions` default to `contents: read`.

| Job | Runs when | What it does |
| --- | --- | --- |
| `changes` | always | Runs `affected.ts` |
| `repo` | always | `actionlint`; `docker compose config` with `.env.deploy.example`, for both the prod file and the build override |
| `verify` | always | `turbo run check-types lint test [--affected]` with coverage; Postgres service; uploads `coverage/` |
| `drift` | cms or twin | The checks below. Each one must leave `git status --porcelain` empty: Payload `migrate:create --skip-empty` (throwaway DB), `generate:types`, `generate:importmap`, drizzle `drizzle-kit generate` |
| `agents` | agents | `eve info` + build, then the offline acceptance evals (Postgres service) |
| `bundle` | web | Web build with throwaway secrets + `scan-client-bundle.ts` |
| `e2e` | web or cms | Throwaway CMS, `next build` + `next start`, Playwright; uploads report and traces on failure |
| `docker` | affected images | Matrix: `docker/build-push-action` build without push, GHA layer cache (one scope per service) |
| `report` | PRs from this repo | `github-script` posts one sticky comment with the affected workspaces and per-package coverage |
| `ci-ok` | always | Fails if any needed job failed or was cancelled. Skipped jobs pass. This is the single required check. |
| `live-evals` | push to main, dispatch | Unchanged logic, now on the `cms` action |
| `publish` | push to main, after `ci-ok` | Matrix of the three images: build (cache hit) and push to GHCR |
| `deploy` | after `publish` | Environment `production`: calls the Easypanel deploy webhook, then polls `PROD_WEB_URL/api/health` until it reports this commit (10 min limit) and `PROD_CMS_URL/api/globals/profile` until it answers 200. When the webhook secret isn't set it skips with a notice. |

### `security.yml`

Runs on PRs, pushes to `main` and weekly:

- CodeQL for `javascript-typescript` and `actions`;
- `actions/dependency-review-action` on PRs, failing on high severity;
- `gitleaks/gitleaks-action` over the full history, with `.gitleaks.toml` allowlisting the CI placeholder secrets (`ci-ci-…`, `ci-canary-…`) and the test fixtures.

### `pr.yml`

`actions/labeler` on `pull_request_target`. It never checks out PR code. `.github/labeler.yml` maps paths to `area:web`, `area:cms`, `area:agents`, `area:twin`, `area:infra` and `area:docs`.

### `dependabot.yml`

Weekly, targeting `develop`. Ecosystems: `bun` (root), `github-actions`, `docker` (the three Dockerfiles) and `docker-compose` (root). Minor and patch updates are grouped per ecosystem; majors come one PR each.

### Hardening (all workflows)

- Third-party and first-party actions are pinned to a commit SHA with a `# vX.Y.Z` comment. Dependabot keeps them current.
- `permissions` are set per job, least-privilege.
- No `${{ github.event.* }}` is interpolated into `run:` scripts.

## 5. Production images and compose

- Images: `ghcr.io/proxziima/my-portfolio-{web,cms,agents}`. `docker/metadata-action` tags them `latest`, `main` and `sha-<short>` and adds the OCI labels (`source` links the package to the repo).
- Every Dockerfile takes `ARG APP_VERSION` in the runtime stage only (the build cache is unaffected) and sets it as `ENV APP_VERSION`.
- `web` gets `GET /api/health`, which returns `{ ok: true, version: APP_VERSION }`. It isn't cached, and the deploy smoke test reads it.
- `docker-compose.yml` becomes the production file:
  - each app service has `image: ${IMAGE_REGISTRY:-ghcr.io/proxziima}/my-portfolio-<svc>:${IMAGE_TAG:-latest}` and `pull_policy: always`;
  - environment, healthchecks, volumes and dependencies are unchanged;
  - it no longer has `build:`.
- `docker-compose.build.yml` is an override that adds `build:` to the three services, for building from source locally or on a server: `docker compose -f docker-compose.yml -f docker-compose.build.yml up --build`.
- `.env.deploy.example` gets `IMAGE_REGISTRY` and `IMAGE_TAG`. Rollback is to set `IMAGE_TAG=sha-<short>` and redeploy.

## 6. Settings outside the repo (owner)

Documented in `docs/ci-cd.md` and `docs/deploy-easypanel.md`:

1. Easypanel: turn off auto-deploy and copy the service's deploy webhook URL into the `EASYPANEL_DEPLOY_WEBHOOK` secret of the `production` environment.
2. GitHub variables `PROD_WEB_URL` and `PROD_CMS_URL`.
3. GHCR: make the three packages public after the first publish, or give Easypanel a `read:packages` token.
4. Turn on secret scanning and push protection.
5. After this merges into `main`: apply the `main` ruleset (`.github/rulesets/main.json`: PR required, `ci-ok` required, no force push) with `gh api`.

## 7. Error handling

- Failing jobs upload their evidence: Playwright report and traces, eval JUnit, CMS and agent logs.
- `drift` prints `git diff` and names the command that fixes the drift.
- `deploy` fails if the webhook call fails or the smoke test runs out of time, and prints the last response.
- `ci-ok` names the jobs that failed.

## 8. Verification

- `affected.ts` has unit tests.
- `actionlint` passes locally on every workflow.
- `docker compose config` passes for both compose files.
- The three images build locally, or in the PR's `docker` job.
- The PR's CI is green, and the expected jobs ran or were skipped.
- A throwaway branch with a schema change but no migration makes `drift` fail. It is not merged.
