# CI/CD

Every pull request into `main` or `develop` and every push to them runs `.github/workflows/ci.yml`. A green
`main` runs release-please, which keeps a release PR open; merging that PR cuts a release, and only a release
publishes the production images to GHCR and deploys them to Easypanel ([Releases](#releases)).

## The pipeline

`changes` decides what a run checks (`scripts/ci/affected.ts`). On a pull request, only the workspaces
Turborepo reports as affected (and everything that depends on them) are checked; the
`futureFlags.githubActionsRemoteBaseRefFallback` flag in `turbo.json` lets `--affected` resolve `origin/<base>` on a
pull-request checkout. A change to `bun.lock`, the root `package.json`, `turbo.json` or `.npmrc`, a compose file,
`.dockerignore`, `.github/` or `scripts/` checks everything, and so does every push.

| Job          | Runs when                    | Gate                                                                                                                                                             |
| ------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repo`       | always                       | actionlint (with shellcheck) on the workflows; both compose files resolve with `.env.deploy.example`                                                             |
| `verify`     | always                       | `check-types`, `lint` and `test` (with coverage, one suite at a time) for the affected workspaces; `bun test scripts`                                            |
| `drift`      | cms or twin                  | Payload migrations, `payload-types.ts`, the admin import map and the twin's drizzle migrations match their sources                                               |
| `agents`     | agents                       | `eve info` + build; offline acceptance evals                                                                                                                     |
| `bundle`     | web                          | the client bundle carries no secret names, values or prompt fragments                                                                                            |
| `e2e`        | web or cms                   | Playwright against a seeded throwaway CMS and the production build of the site                                                                                   |
| `docker`     | per affected image           | the image builds (no push)                                                                                                                                       |
| `report`     | pull requests from this repo | one comment: what was checked, coverage per package. Coverage counts every source file, not only the ones a test loads, so a number can be lower than you expect |
| `ci-ok`      | always                       | green when every gate above passed or was skipped as unaffected: the required check                                                                              |
| `live-evals` | push to main, manual         | real-model evals (spends OpenRouter credit; never blocks a deploy; skipped while the `OPENROUTER_API_KEY` secret is not set)                                     |
| `release`    | push to main, after `ci-ok`  | release-please opens or updates the release PR; on the merge of that PR it tags `v<version>` and creates the GitHub Release                                      |
| `publish`    | a release was created        | pushes `ghcr.io/proxziima/my-portfolio-{web,cms,agents}` from the release tag as `<version>`, `latest` and `sha-<short>`                                         |
| `deploy`     | after `publish`              | calls Easypanel's deploy trigger, then waits until `/api/health` reports the released version and the CMS answers                                                |

`security.yml` runs CodeQL (TypeScript and the workflows themselves), dependency review (PRs) and gitleaks on
every PR into `main` or `develop`, every push to them, and weekly. `.gitleaks.toml` allowlists the placeholders
CI commits on purpose and the test fixtures; a real finding is never allowlisted. `pr.yml` labels PRs by area.

Dependabot opens weekly updates against `develop` for bun, GitHub Actions (the workflows and the three composite
actions), the three Dockerfiles and the compose file. GitHub Actions and base-image updates arrive grouped, and so do
bun's minor and patch updates (a major version arrives as its own PR). It ignores the major versions of `node` and
`postgres` and every `oven/bun` image update: bump those by hand (Node is pinned in `package.json`; bun in seven places,
the `devEngines` field, the setup action, `ci.yml` twice and the three Dockerfiles; a Postgres major needs a dump and
restore of the `twin-pg` volume).

## Releases

The product has one version, in the root `package.json`: web, cms and agents ship together. release-please
(`release-please-config.json`, `.release-please-manifest.json`) reads the conventional commits that reach `main`
and decides the next version. The first release is `v0.0.1`; its changelog starts after the PR #1 merge
(`bootstrap-sha`).

| Commit                                             | Bump below 1.0           |
| -------------------------------------------------- | ------------------------ |
| `fix:`                                             | patch                    |
| `feat:`                                            | minor                    |
| breaking change (`feat!:`, `BREAKING CHANGE:`)     | minor                    |
| `chore`, `docs`, `test`, `ci`, `build`, `refactor` | no release by themselves |

1. A push to `main` passes `ci-ok`, then the `release` job opens a release PR (`chore(main): release <version>`),
   or updates the one already open. The PR bumps `package.json`, the manifest and `CHANGELOG.md`.
2. Nothing ships until you merge that PR. Merge it when you want to ship what has accumulated.
3. The merge runs CI on `main` again. `release` then tags `v<version>` and creates the GitHub Release with the
   changelog entry as its notes, and `publish` and `deploy` run for that version.
4. `publish` checks out the tag and pushes each image as `<version>` (e.g. `0.0.1`, no `v`), `latest` and
   `sha-<short>`. The images report the version as `APP_VERSION`, so `/api/health` answers `0.0.1`, and `deploy`
   waits for exactly that.
5. Merge `main` back into `develop` after each release, so `develop` has the version bump and the changelog.

Going to 1.0.0 is a deliberate decision: add the footer `Release-As: 1.0.0` to a commit that reaches `main`, e.g.
`git commit --allow-empty -m "chore: release 1.0.0" -m "Release-As: 1.0.0"`. After 1.0, a breaking change bumps
the major version.

A release PR opened with the built-in `GITHUB_TOKEN` triggers no workflow, so its `ci-ok` check never reports
and the `main` ruleset blocks it. With the `RELEASE_PLEASE_TOKEN` secret set
([setup](#one-time-setup-repository-owner)), the PR is opened with that token and CI runs on it like on any other
PR. Without it, the job falls back to `github.token`, and you merge the release PR through the admin bypass.

## When a gate fails

- **drift:** the job log names the command. A new file under `apps/payload/src/migrations` means a schema
  change has no migration: create it against a throwaway database (see
  [deploy-easypanel.md](deploy-easypanel.md#updating)) and commit it. Otherwise regenerate and commit:
  `bun run --cwd apps/payload generate:types`, `generate:importmap`, `bun run --cwd packages/twin db:generate`.
- **e2e:** download the `e2e-report` artifact (Playwright report, traces and the CMS log from `ci-logs/`).
- **agents:** if the offline evals fail, the `agents-evals` artifact has their JUnit report
  (`apps/agents/fixtures/offline/.eve/junit.xml`).
- **live-evals:** the `live-evals` artifact has the JUnit report and the CMS and agent logs from `ci-logs/`.
- **gitleaks:** treat a real finding as leaked and rotate the secret. Allowlist only a placeholder or a test
  fixture, in `.gitleaks.toml`.
- **deploy:** the log shows the last answer from production. Check the Easypanel deployment log.

## Run the gates locally

```bash
bunx turbo run check-types lint
bunx turbo run test --concurrency=1 -- --coverage
bun test scripts
```

Tests run one suite at a time because wall-clock assertions in the cms favicon tests need an unshared CPU. The root
`bun run test` script sets the same flag, but it can't take `--coverage`: turbo would receive it.

## One-time setup (repository owner)

1. **Easypanel:** in the Compose service, turn **auto-deploy off**: CI deploys after the checks pass. Copy the
   service's **Deployment Trigger** URL (Deployments tab).
2. **GitHub → Settings → Environments → `production`** (created by the first deploy run, or create it): add
   the secret `EASYPANEL_DEPLOY_WEBHOOK` (the trigger URL) and the variables `PROD_WEB_URL` and `PROD_CMS_URL`
   (public origins, no trailing slash). Until the secret exists, `publish` pushes the images and `deploy`
   skips with a notice.
3. **GHCR:** after the first `publish`, open each package (`my-portfolio-web`, `-cms`, `-agents`) under your
   profile's **Packages** and set its visibility to **public**, so Easypanel pulls without credentials. Keep them
   private instead by adding a registry credential in Easypanel (a token with `read:packages`).
4. **Secret scanning:** Settings → Code security → enable **Secret scanning** and **Push protection**.
5. **Dependency graph:** Settings → Code security → enable **Dependency graph** and **Dependabot alerts**.
   The `dependency-review` job needs the graph and fails on every PR without it. GitHub's graph doesn't read
   `bun.lock`, so dependency review sees the direct `package.json` dependencies and the workflow actions only;
   Dependabot's bun updates are what cover the lockfile.
6. **Ruleset:** once this workflow is on `main` (so the `ci-ok` check exists), protect `main`. The ruleset
   requires a pull request and the `ci-ok` check; repository admins can bypass it only through a pull request
   (`bypass_mode: pull_request`):
   ```bash
   gh api -X POST repos/proxziima/my-portfolio/rulesets --input .github/rulesets/main.json
   ```
7. **Release token:** create a fine-grained personal access token with access to this repository only and the
   permissions **Contents: Read and write** and **Pull requests: Read and write**. Store it as the repository
   secret `RELEASE_PLEASE_TOKEN` (Settings → Secrets and variables → Actions). Release PRs opened with it run CI
   and report `ci-ok`. Renew it before it expires. Without it, the `release` job uses `github.token`: enable
   Settings → Actions → General → **Allow GitHub Actions to create and approve pull requests**, and merge each
   release PR through the admin bypass.

## Rollback

Set `IMAGE_TAG=<older version>` (e.g. `0.0.1`; every version is listed under the repository's Releases) in the
Easypanel service's environment and deploy. Set it back to `latest` to follow the newest release again.
