# CI/CD Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every workspace and every shipped artifact of the monorepo is gated in CI. A green `main` publishes the production images to GHCR and deploys them to Easypanel, and a smoke test proves the new version is live.

**Architecture:** One `ci.yml` fans out from a `changes` job. A tested Bun script (`scripts/ci/affected.ts`) turns `turbo query affected` and the diff into per-workspace outputs. Parallel jobs gate code, generated files, images, e2e and evals, and a single `ci-ok` aggregator is the required check. On `main`, `publish` pushes images and `deploy` triggers Easypanel and runs `scripts/ci/smoke.ts`. Security scanning (`security.yml`), labeling (`pr.yml`) and Dependabot are separate.

**Tech Stack:** GitHub Actions, Bun 1.3.10, Turborepo 2.11.5, Docker Buildx + GHCR, Payload 3.90, drizzle-kit, Vitest (v8 coverage), Playwright, CodeQL, gitleaks, Dependabot.

**Spec:** `docs/superpowers/specs/2026-10-05-ci-cd-automation-design.md`

---

## Rules for every task (read first)

- **Worktree:** `D:\Second Brain\01.PROJETOS\applications\my-portfolio\.claude\worktrees\ci-cd-automation`, branch `feat/ci-cd-automation`. Run everything from there. Never `cd` to the main checkout.
- **Bash guard:** the Bash tool rejects compound commands (`&&`, `;`, `|`, heredocs, `$(…)`) that contain the letters `git` anywhere, even inside `github` or `gitleaks`. Run `git add <paths>` and `git commit -m …` as separate single commands with literal paths. When a command needs `gh`, `github` or `gitleaks` in a pipeline, use the PowerShell tool.
- **Commits:** stage files by name, never `git add -A`. End every commit message with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).
- **Payload DB safety:** never touch `apps/payload/payload.db` or its `.bak` files. Anything that needs a Payload database uses a throwaway `file:./.tmp/<name>.db` under `apps/payload`.
- **Ports:** the main checkout owns 3000/3001. If you start the web app from this worktree, use `PORT=3100`. The CMS on 3001 is shared and read-only.
- **No Docker locally.** `docker build`/`docker compose config` are verified by CI. Postgres for dev lives in WSL on `127.0.0.1:5433` (`twin`/`twin`). Never write `localhost` for it.
- **Action pins** (use exactly these; the comment carries the version for Dependabot):

| Action | Pin |
| --- | --- |
| actions/checkout | `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` |
| actions/cache | `actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0` |
| actions/upload-artifact | `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1` |
| actions/download-artifact | `actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1` |
| actions/github-script | `actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3 # v9.0.0` |
| actions/setup-node | `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0` |
| oven-sh/setup-bun | `oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0` |
| docker/setup-buildx-action | `docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4.4.1` |
| docker/build-push-action | `docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc # v7.4.0` |
| docker/metadata-action | `docker/metadata-action@dc802804100637a589fabce1cb79ff13a1411302 # v6.2.0` |
| docker/login-action | `docker/login-action@dbcb813823bdd20940b903addbd779551569679f # v4.6.0` |
| github/codeql-action (init/analyze) | `github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2 # v4.38.2` (same SHA for `/analyze`) |
| actions/dependency-review-action | `actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294 # v5.0.0` |
| gitleaks/gitleaks-action | `gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e # v3.0.0` |
| actions/labeler | `actions/labeler@bf12e9b00b37c5c0ca2b87b79b2daf7891dbda13 # v7.0.0` |
| actionlint (docker image) | `rhysd/actionlint:1.7.12` |

## File map

| File | Responsibility |
| --- | --- |
| `scripts/ci/affected.ts` (+ `.test.ts`) | Event + turbo affected + diff → per-workspace booleans and image matrix |
| `scripts/ci/coverage-report.ts` (+ `.test.ts`) | Coverage summaries → markdown PR comment body |
| `scripts/ci/smoke.ts` (+ `.test.ts`) | Polls production until web reports the deployed commit and the CMS answers |
| `apps/web/app/api/health/route.ts` (+ `tests/unit/health/health-route.test.ts`) | `{ ok, version }` for the smoke test |
| `.github/actions/setup/action.yml` | Bun + Node + caches + install |
| `.github/actions/secrets/action.yml` | Random masked throwaway secrets → `$GITHUB_ENV` |
| `.github/actions/cms/action.yml` | Throwaway CMS: build, seed, start on :3001 |
| `.github/workflows/ci.yml` | The pipeline (rewritten) |
| `.github/workflows/security.yml` | CodeQL, dependency review, gitleaks |
| `.github/workflows/pr.yml` + `.github/labeler.yml` | Path labels |
| `.github/dependabot.yml` | Weekly grouped updates into `develop` |
| `.github/codeql/codeql-config.yml` | CodeQL path ignores |
| `.github/rulesets/main.json` | Branch ruleset applied by the owner after merge |
| `.gitleaks.toml` | Allowlist for CI placeholders and fixtures |
| `docker-compose.yml` | Production: pulls GHCR images |
| `docker-compose.build.yml` | Override: build the images from source |
| `.env.deploy.example` | + `IMAGE_REGISTRY`, `IMAGE_TAG` |
| `turbo.json`, root `package.json`, 4× vitest configs, 4× package.json | Turbo env passthrough, coverage |
| `apps/*/Dockerfile` | No `apps/docs`; `APP_VERSION` build arg |
| `docs/ci-cd.md`, `docs/deploy-easypanel.md`, `README.md` | Documentation |

---

### Task 1: Remove the Turborepo starter leftovers

**Files:**
- Delete: `apps/docs/` (whole directory), `packages/ui/` (whole directory)
- Maybe delete: `packages/eslint-config/react-internal.js`, and modify `packages/eslint-config/package.json` (step 2)
- Modify: `apps/web/Dockerfile`, `apps/payload/Dockerfile`, `apps/agents/Dockerfile` (drop the `COPY apps/docs/package.json apps/docs/` line and the `COPY packages/ui/package.json packages/ui/` line)
- Modify: `README.md`, `bun.lock`

- [ ] **Step 1: Delete the two workspaces from git**

Run: `git rm -r -q apps/docs packages/ui`
Then, because untracked leftovers such as `node_modules` and `.next` may remain, run `rm -rf apps/docs packages/ui`.

- [ ] **Step 2: Remove `react-internal` from the eslint config if nothing else uses it**

Run the Grep tool for `react-internal` over `apps`, `packages` and the repo root, excluding `node_modules`.
Expected: the only hits are in `packages/eslint-config` itself (`package.json` export and the file). If so, delete `packages/eslint-config/react-internal.js` and remove the line `"./react-internal": "./react-internal.js"` from the `exports` in `packages/eslint-config/package.json`. Remove the trailing comma on the line before it if that line becomes last. If anything else imports it, keep both and note that in the report.

- [ ] **Step 3: Drop the two manifests from the three Dockerfiles**

In each of `apps/web/Dockerfile`, `apps/payload/Dockerfile` and `apps/agents/Dockerfile`, delete exactly these two lines:

```dockerfile
COPY apps/docs/package.json apps/docs/
```
```dockerfile
COPY packages/ui/package.json packages/ui/
```

- [ ] **Step 4: Update the README architecture table**

In `README.md`, delete this row:

```markdown
| `apps/docs`, `packages/ui` | `docs`, `@repo/ui` | 3002 | Turborepo starter leftovers, not part of the portfolio. |
```

In the Runbook code block, change the comment on `bun run dev` from `# every workspace's dev task, web :3000, CMS :3001 and the starter docs :3002` to `# every workspace's dev task: web :3000, CMS :3001, agents :4100`. Then use the Grep tool on `README.md` for `docs :3002|3002|apps/docs|@repo/ui` and fix any other hit the same way.

- [ ] **Step 5: Regenerate the lockfile**

Run: `bun install`
Then run: `git diff --stat bun.lock`
Expected: only deletions. The removed lines are the `apps/docs` and `packages/ui` workspace entries and the packages that only they used. If any existing package changes version, stop and report: the lockfile must not drift.

- [ ] **Step 6: Verify nothing else referenced them**

Run: `bunx turbo run check-types`
Expected: `Tasks: 4 successful` or 5 (no `docs#check-types` or `@repo/ui#check-types`), with no failure.

- [ ] **Step 7: Commit**

```bash
git add -A apps/docs packages/ui packages/eslint-config apps/web/Dockerfile apps/payload/Dockerfile apps/agents/Dockerfile README.md bun.lock
git commit -m "chore: remove the Turborepo starter docs app and ui package" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git add -A <paths>` limited to those paths records the deletions; it is the only allowed use of `-A`.)

---

### Task 2: Affected-workspace detection script

**Files:**
- Create: `scripts/ci/affected.ts`
- Test: `scripts/ci/affected.test.ts`

Root scripts use `bun:test` (see `scripts/scan-client-bundle.test.ts`). Run them with `bun test scripts`.

- [ ] **Step 1: Write the failing test**

`scripts/ci/affected.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { decide, IMAGES, toOutputs } from './affected'

const pr = (packages: string[], files: string[]) => decide({ event: 'pull_request', packages, files })

describe('decide', () => {
  it('checks everything on a push, a manual run or a schedule', () => {
    for (const event of ['push', 'workflow_dispatch', 'schedule']) {
      const result = decide({ event, packages: [], files: [] })
      expect(result.all).toBe(true)
      expect(result.workspaces).toEqual({ web: true, cms: true, agents: true, twin: true })
      expect(result.images).toEqual([...IMAGES])
    }
  })

  it('checks only the workspaces turbo reports for a pull request', () => {
    const result = pr(['web'], ['apps/web/app/page.tsx'])
    expect(result.all).toBe(false)
    expect(result.workspaces).toEqual({ web: true, cms: false, agents: false, twin: false })
    expect(result.images).toEqual([{ service: 'web', dockerfile: 'apps/web/Dockerfile' }])
  })

  it('follows dependents: a twin change reaches agents, cms and web', () => {
    const result = pr(['@repo/twin', 'agents', 'cms', 'web'], ['packages/twin/src/env.ts'])
    expect(result.workspaces).toEqual({ web: true, cms: true, agents: true, twin: true })
    expect(result.images.map((i) => i.service)).toEqual(['web', 'cms', 'agents'])
  })

  it('treats lockfile, root config, compose, CI and root scripts as repo-wide', () => {
    for (const file of [
      'bun.lock',
      'package.json',
      'turbo.json',
      '.npmrc',
      'docker-compose.yml',
      'docker-compose.build.yml',
      '.dockerignore',
      '.github/workflows/ci.yml',
      'scripts/scan-client-bundle.ts',
    ]) {
      expect(pr([], [file]).all).toBe(true)
    }
  })

  it('checks nothing for a docs-only pull request', () => {
    const result = pr([], ['docs/ci-cd.md', 'README.md'])
    expect(result.all).toBe(false)
    expect(result.workspaces).toEqual({ web: false, cms: false, agents: false, twin: false })
    expect(result.images).toEqual([])
  })

  it('ignores packages that are not gated workspaces', () => {
    expect(pr(['//', '@repo/cms-types'], ['packages/cms-types/src/index.ts']).workspaces.web).toBe(false)
  })
})

describe('toOutputs', () => {
  it('writes one GITHUB_OUTPUT line per key, with JSON for lists', () => {
    const out = toOutputs(pr(['cms'], ['apps/payload/src/payload.config.ts']))
    expect(out).toBe(
      [
        'all=false',
        'web=false',
        'cms=true',
        'agents=false',
        'twin=false',
        'images=[{"service":"cms","dockerfile":"apps/payload/Dockerfile"}]',
        'affected=["cms"]',
        '',
      ].join('\n'),
    )
  })
})
```

Note on the last `decide` test: `@repo/cms-types` changes make Turbo also report its dependents (`web`, `cms`). The test only feeds `//` and `@repo/cms-types` to prove that unknown names are ignored.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/ci/affected.test.ts`
Expected: FAIL with `Cannot find module './affected'`.

- [ ] **Step 3: Write the implementation**

`scripts/ci/affected.ts`:

```ts
import { appendFileSync } from 'node:fs'

/** Workspaces CI gates separately, by output key, with their package names. */
export const WORKSPACES = { web: 'web', cms: 'cms', agents: 'agents', twin: '@repo/twin' } as const
export type Workspace = keyof typeof WORKSPACES

/** Production images and the Dockerfile each is built from (the build context is the repo root). */
export const IMAGES = [
  { service: 'web', dockerfile: 'apps/web/Dockerfile' },
  { service: 'cms', dockerfile: 'apps/payload/Dockerfile' },
  { service: 'agents', dockerfile: 'apps/agents/Dockerfile' },
] as const
export type Image = (typeof IMAGES)[number]

/** Files outside every workspace whose change can affect anything: lockfile, root config, compose, CI. */
const REPO_WIDE = [
  /^bun\.lock$/,
  /^package\.json$/,
  /^turbo\.json$/,
  /^\.npmrc$/,
  /^docker-compose[^/]*\.ya?ml$/,
  /^\.dockerignore$/,
  /^\.github\//,
  /^scripts\//,
]

export interface Affected {
  /** Everything is checked: not a pull request, or a repo-wide file changed. */
  all: boolean
  workspaces: Record<Workspace, boolean>
  images: Image[]
}

/** What a CI run has to check, from the event, Turbo's affected packages and the changed files. */
export function decide(input: {
  event: string
  packages: readonly string[]
  files: readonly string[]
}): Affected {
  const all =
    input.event !== 'pull_request' || input.files.some((file) => REPO_WIDE.some((re) => re.test(file)))
  const workspaces = Object.fromEntries(
    (Object.entries(WORKSPACES) as Array<[Workspace, string]>).map(([key, name]) => [
      key,
      all || input.packages.includes(name),
    ]),
  ) as Record<Workspace, boolean>
  return { all, workspaces, images: IMAGES.filter((image) => workspaces[image.service]) }
}

/** `key=value` lines for `$GITHUB_OUTPUT`; lists are JSON so workflows can `fromJSON` them. */
export function toOutputs(affected: Affected): string {
  const entries = Object.entries(affected.workspaces)
  return [
    `all=${affected.all}`,
    ...entries.map(([key, value]) => `${key}=${value}`),
    `images=${JSON.stringify(affected.images)}`,
    `affected=${JSON.stringify(entries.filter(([, value]) => value).map(([key]) => key))}`,
    '',
  ].join('\n')
}

function run(cmd: string[]): string {
  const result = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'inherit' })
  if (result.exitCode !== 0) throw new Error(`${cmd.join(' ')} exited with ${result.exitCode}`)
  return result.stdout.toString()
}

/** CI entry (the `changes` job). Needs a checkout with history (`fetch-depth: 0`). */
if (import.meta.main) {
  const event = process.env.GITHUB_EVENT_NAME ?? 'workflow_dispatch'
  const baseRef = process.env.GITHUB_BASE_REF
  let packages: string[] = []
  let files: string[] = []
  if (event === 'pull_request' && baseRef) {
    const base = `origin/${baseRef}`
    const query = JSON.parse(run(['bunx', 'turbo', 'query', 'affected', '--packages', '--base', base])) as {
      data: { affectedPackages: { items: Array<{ name: string }> } }
    }
    packages = query.data.affectedPackages.items.map((item) => item.name)
    files = run(['git', 'diff', '--name-only', `${base}...HEAD`]).split('\n').filter(Boolean)
  }
  const outputs = toOutputs(decide({ event, packages, files }))
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, outputs)
  process.stdout.write(outputs)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/ci/affected.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Smoke-run the CLI against this branch**

Run (PowerShell tool): `$env:GITHUB_EVENT_NAME='pull_request'; $env:GITHUB_BASE_REF='develop'; bun scripts/ci/affected.ts`
This only works if `origin/develop` exists locally, which it does after `git fetch`.
Expected: prints the output lines with `all=true`, because this branch touches `bun.lock` and `scripts/`. No exception.

- [ ] **Step 6: Commit**

```bash
git add scripts/ci/affected.ts scripts/ci/affected.test.ts
git commit -m "ci: detect the affected workspaces and images for a run" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Coverage report renderer

**Files:**
- Create: `scripts/ci/coverage-report.ts`
- Test: `scripts/ci/coverage-report.test.ts`

Vitest's `json-summary` reporter writes `coverage/coverage-summary.json` per package. A metric's `pct` is a number, or the string `"Unknown"` when nothing was measured.

- [ ] **Step 1: Write the failing test**

`scripts/ci/coverage-report.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MARKER, readCoverage, renderReport, type CoverageSummary } from './coverage-report'

const summary = (lines: number | 'Unknown', branches = 50): CoverageSummary => ({
  total: { lines: { pct: lines }, statements: { pct: 80 }, functions: { pct: 70 }, branches: { pct: branches } },
})

describe('renderReport', () => {
  it('starts with the marker and lists packages sorted, one row each', () => {
    const body = renderReport({
      all: false,
      affected: ['web', 'cms'],
      verify: 'success',
      runUrl: 'https://example.test/run/1',
      coverage: [
        { pkg: 'apps/web', summary: summary(91.234) },
        { pkg: 'apps/payload', summary: summary(40) },
      ],
    })
    expect(body.startsWith(`${MARKER}\n`)).toBe(true)
    expect(body).toContain('**Checked:** `web`, `cms`')
    expect(body).toContain('**verify:** success')
    expect(body.indexOf('`apps/payload`')).toBeLessThan(body.indexOf('`apps/web`'))
    expect(body).toContain('| `apps/web` | 91.2% | 80.0% | 70.0% | 50.0% |')
    expect(body).toContain('[Run details](https://example.test/run/1)')
  })

  it('says everything was checked on a repo-wide change', () => {
    const body = renderReport({ all: true, affected: [], verify: 'success', runUrl: '', coverage: [] })
    expect(body).toContain('**Checked:** everything (repo-wide change)')
  })

  it('says when no tests ran', () => {
    const body = renderReport({ all: false, affected: [], verify: 'success', runUrl: '', coverage: [] })
    expect(body).toContain('**Checked:** nothing')
    expect(body).toContain('No coverage: no tests ran for this change.')
  })

  it('shows an unmeasured metric as a dash', () => {
    const body = renderReport({
      all: false,
      affected: ['twin'],
      verify: 'failure',
      runUrl: '',
      coverage: [{ pkg: 'packages/twin', summary: summary('Unknown') }],
    })
    expect(body).toContain('| `packages/twin` | – | 80.0% | 70.0% | 50.0% |')
  })
})

describe('readCoverage', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('finds every coverage/coverage-summary.json and names it by its package path', () => {
    dir = mkdtempSync(join(tmpdir(), 'cov-'))
    for (const pkg of ['apps/web', 'packages/twin']) {
      mkdirSync(join(dir, pkg, 'coverage'), { recursive: true })
      writeFileSync(join(dir, pkg, 'coverage', 'coverage-summary.json'), JSON.stringify(summary(10)))
    }
    writeFileSync(join(dir, 'stray.json'), '{}')
    expect(readCoverage(dir).map((c) => c.pkg).sort()).toEqual(['apps/web', 'packages/twin'])
  })

  it('returns nothing for a missing directory', () => {
    dir = join(tmpdir(), 'does-not-exist-cov')
    expect(readCoverage(dir)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/ci/coverage-report.test.ts`
Expected: FAIL with `Cannot find module './coverage-report'`.

- [ ] **Step 3: Write the implementation**

`scripts/ci/coverage-report.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'

/** Marks the CI comment so later runs update it instead of adding another. */
export const MARKER = '<!-- ci-report -->'

interface Metric {
  pct: number | 'Unknown'
}
export interface CoverageSummary {
  total: { lines: Metric; statements: Metric; functions: Metric; branches: Metric }
}
export interface PackageCoverage {
  /** Package directory relative to the repo root, e.g. `apps/web`. */
  pkg: string
  summary: CoverageSummary
}

const pct = (metric: Metric) => (typeof metric.pct === 'number' ? `${metric.pct.toFixed(1)}%` : '–')

/** The PR comment: what was checked, the verify result and coverage per package. */
export function renderReport(input: {
  all: boolean
  affected: readonly string[]
  verify: string
  runUrl: string
  coverage: readonly PackageCoverage[]
}): string {
  const scope = input.all
    ? 'everything (repo-wide change)'
    : input.affected.length > 0
      ? input.affected.map((name) => `\`${name}\``).join(', ')
      : 'nothing'
  const lines = [MARKER, '### CI report', '', `**Checked:** ${scope}`, '', `**verify:** ${input.verify}`, '']
  if (input.coverage.length === 0) {
    lines.push('No coverage: no tests ran for this change.')
  } else {
    lines.push('| Package | Lines | Statements | Functions | Branches |', '| --- | ---: | ---: | ---: | ---: |')
    for (const { pkg, summary } of [...input.coverage].sort((a, b) => a.pkg.localeCompare(b.pkg))) {
      const { lines: l, statements, functions, branches } = summary.total
      lines.push(`| \`${pkg}\` | ${pct(l)} | ${pct(statements)} | ${pct(functions)} | ${pct(branches)} |`)
    }
  }
  lines.push('', `[Run details](${input.runUrl})`, '')
  return lines.join('\n')
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

/** Every `<pkg>/coverage/coverage-summary.json` under `dir` (the downloaded artifact). */
export function readCoverage(dir: string): PackageCoverage[] {
  if (!existsSync(dir)) return []
  return walk(dir)
    .filter((path) => basename(path) === 'coverage-summary.json' && basename(dirname(path)) === 'coverage')
    .map((path) => ({
      pkg: relative(dir, dirname(dirname(path))).split(sep).join('/'),
      summary: JSON.parse(readFileSync(path, 'utf8')) as CoverageSummary,
    }))
}

/** CI entry (the `report` job): prints the comment body. */
if (import.meta.main) {
  process.stdout.write(
    renderReport({
      all: process.env.ALL === 'true',
      affected: JSON.parse(process.env.AFFECTED || '[]') as string[],
      verify: process.env.VERIFY ?? 'unknown',
      runUrl: process.env.RUN_URL ?? '',
      coverage: readCoverage(process.argv[2] ?? 'coverage-artifact'),
    }),
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/ci/coverage-report.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/ci/coverage-report.ts scripts/ci/coverage-report.test.ts
git commit -m "ci: render the PR report with per-package coverage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Production smoke test script

**Files:**
- Create: `scripts/ci/smoke.ts`
- Test: `scripts/ci/smoke.test.ts`

- [ ] **Step 1: Write the failing test**

`scripts/ci/smoke.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { cmsServes, waitFor, webServes, type Probe } from './smoke'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

describe('webServes', () => {
  it('is ok when /api/health reports the expected version', async () => {
    const seen: string[] = []
    const probe = await webServes(async (url) => (seen.push(String(url)), json(200, { ok: true, version: 'abc' })), 'https://w.test', 'abc')
    expect(probe).toEqual({ ok: true, detail: 'web serves abc' })
    expect(seen).toEqual(['https://w.test/api/health'])
  })

  it('waits while the old version is still serving', async () => {
    const probe = await webServes(async () => json(200, { ok: true, version: 'old' }), 'https://w.test', 'new')
    expect(probe).toEqual({ ok: false, detail: 'web serves old, waiting for new' })
  })

  it('reports a bad status and an unreachable host', async () => {
    expect((await webServes(async () => json(502, {}), 'https://w.test', 'v')).detail).toBe('web /api/health answered 502')
    const down = await webServes(async () => {
      throw new Error('ECONNREFUSED')
    }, 'https://w.test', 'v')
    expect(down).toEqual({ ok: false, detail: 'web unreachable: ECONNREFUSED' })
  })
})

describe('cmsServes', () => {
  it('is ok when the public profile global answers 200', async () => {
    const seen: string[] = []
    const probe = await cmsServes(async (url) => (seen.push(String(url)), json(200, {})), 'https://c.test')
    expect(probe.ok).toBe(true)
    expect(seen).toEqual(['https://c.test/api/globals/profile'])
  })

  it('is not ok on an error status', async () => {
    expect(await cmsServes(async () => json(503, {}), 'https://c.test')).toEqual({ ok: false, detail: 'cms answered 503' })
  })
})

describe('waitFor', () => {
  it('retries until the probe passes', async () => {
    let calls = 0
    let clock = 0
    const result = await waitFor(
      async (): Promise<Probe> => (++calls < 3 ? { ok: false, detail: 'not yet' } : { ok: true, detail: 'up' }),
      { timeoutMs: 60_000, intervalMs: 10_000, sleep: async (ms) => void (clock += ms), now: () => clock },
    )
    expect(result).toEqual({ ok: true, detail: 'up' })
    expect(calls).toBe(3)
  })

  it('gives up after the timeout with the last detail', async () => {
    let clock = 0
    const result = await waitFor(async () => ({ ok: false, detail: `t=${clock}` }), {
      timeoutMs: 30_000,
      intervalMs: 10_000,
      sleep: async (ms) => void (clock += ms),
      now: () => clock,
    })
    expect(result).toEqual({ ok: false, detail: 't=30000' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/ci/smoke.test.ts`
Expected: FAIL with `Cannot find module './smoke'`.

- [ ] **Step 3: Write the implementation**

`scripts/ci/smoke.ts`:

```ts
/** One check of a production endpoint. */
export interface Probe {
  ok: boolean
  detail: string
}
type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/** Web is live on the expected commit: `/api/health` reports it as `version`. */
export async function webServes(fetchFn: Fetch, webUrl: string, version: string): Promise<Probe> {
  try {
    const res = await fetchFn(`${webUrl}/api/health`, { cache: 'no-store' })
    if (!res.ok) return { ok: false, detail: `web /api/health answered ${res.status}` }
    const body = (await res.json()) as { version?: string }
    return body.version === version
      ? { ok: true, detail: `web serves ${version}` }
      : { ok: false, detail: `web serves ${body.version ?? 'no version'}, waiting for ${version}` }
  } catch (error) {
    return { ok: false, detail: `web unreachable: ${(error as Error).message}` }
  }
}

/** The CMS has started and applied its migrations: its public profile global answers 200. */
export async function cmsServes(fetchFn: Fetch, cmsUrl: string): Promise<Probe> {
  try {
    const res = await fetchFn(`${cmsUrl}/api/globals/profile`, { cache: 'no-store' })
    return res.ok ? { ok: true, detail: 'cms answers' } : { ok: false, detail: `cms answered ${res.status}` }
  } catch (error) {
    return { ok: false, detail: `cms unreachable: ${(error as Error).message}` }
  }
}

/** Re-runs `probe` every `intervalMs` until it passes or `timeoutMs` has elapsed; returns the last result. */
export async function waitFor(
  probe: () => Promise<Probe>,
  opts: { timeoutMs: number; intervalMs: number; sleep?: (ms: number) => Promise<void>; now?: () => number },
): Promise<Probe> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = opts.now ?? Date.now
  const deadline = now() + opts.timeoutMs
  let last = await probe()
  while (!last.ok && now() < deadline) {
    await sleep(opts.intervalMs)
    last = await probe()
  }
  return last
}

function required(name: string): string {
  const value = process.env[name]?.replace(/\/+$/, '')
  if (!value) throw new Error(`${name} is not set`)
  return value
}

/** CI entry (the `deploy` job): exits 1 unless production serves this commit within the time limit. */
if (import.meta.main) {
  const web = required('PROD_WEB_URL')
  const cms = required('PROD_CMS_URL')
  const version = required('EXPECTED_VERSION')
  const log = (probe: Probe) => (console.log(probe.detail), probe)
  const webResult = await waitFor(async () => log(await webServes(fetch, web, version)), {
    timeoutMs: 10 * 60_000,
    intervalMs: 10_000,
  })
  const cmsResult = webResult.ok
    ? await waitFor(async () => log(await cmsServes(fetch, cms)), { timeoutMs: 2 * 60_000, intervalMs: 10_000 })
    : webResult
  if (!webResult.ok || !cmsResult.ok) {
    console.error(`smoke test failed: ${(webResult.ok ? cmsResult : webResult).detail}`)
    process.exit(1)
  }
  console.log(`production serves ${version}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/ci/smoke.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/ci/smoke.ts scripts/ci/smoke.test.ts
git commit -m "ci: smoke-test that production serves the deployed commit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Web health endpoint and image version

**Files:**
- Create: `apps/web/app/api/health/route.ts`
- Test: `apps/web/tests/unit/health/health-route.test.ts`
- Modify: `apps/web/Dockerfile`, `apps/payload/Dockerfile`, `apps/agents/Dockerfile`

- [ ] **Step 1: Write the failing test**

`apps/web/tests/unit/health/health-route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/health/route'

afterEach(() => vi.unstubAllEnvs())

describe('GET /api/health', () => {
  it('reports the image version and is never cached', async () => {
    vi.stubEnv('APP_VERSION', '0123abc')
    const res = GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ ok: true, version: '0123abc' })
  })

  it('reports "dev" outside an image', async () => {
    vi.stubEnv('APP_VERSION', '')
    expect(await GET().json()).toEqual({ ok: true, version: 'dev' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --cwd apps/web test -- tests/unit/health`
Expected: FAIL. The import of `@/app/api/health/route` can't be resolved.

- [ ] **Step 3: Write the route**

`apps/web/app/api/health/route.ts`:

```ts
/**
 * Liveness plus the running image's version (`APP_VERSION`, the commit CI built it from). The deploy
 * job's smoke test polls it until production reports the commit it just published.
 */
export function GET() {
  return Response.json(
    { ok: true, version: process.env.APP_VERSION || 'dev' },
    { headers: { 'cache-control': 'no-store' } },
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --cwd apps/web test -- tests/unit/health`
Expected: PASS, 2 tests.

- [ ] **Step 5: Bake the version into each runtime stage**

`apps/web/Dockerfile`: in the `runtime` stage, replace

```dockerfile
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
```

with

```dockerfile
FROM node:24-bookworm-slim AS runtime
# The commit CI built this image from (`/api/health` reports it). Declared here, after every build step,
# so a new value never invalidates the cached install and build layers.
ARG APP_VERSION=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 APP_VERSION=$APP_VERSION
```

`apps/payload/Dockerfile`: replace

```dockerfile
FROM build AS runtime
ENV NODE_ENV=production \
```

with

```dockerfile
FROM build AS runtime
# The commit CI built this image from. Declared after the build, so it never invalidates cached layers.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION \
    NODE_ENV=production \
```

`apps/agents/Dockerfile`: replace

```dockerfile
FROM base AS runtime
ENV NODE_ENV=production PORT=3000
```

with

```dockerfile
FROM base AS runtime
# The commit CI built this image from. Declared after the build, so it never invalidates cached layers.
ARG APP_VERSION=dev
ENV NODE_ENV=production PORT=3000 APP_VERSION=$APP_VERSION
```

- [ ] **Step 6: Run the web checks**

Run: `bun run --cwd apps/web check-types`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/health/route.ts apps/web/tests/unit/health/health-route.test.ts apps/web/Dockerfile apps/payload/Dockerfile apps/agents/Dockerfile
git commit -m "feat(web): /api/health reports the image's commit for the deploy smoke test" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Turbo tasks, test passthrough and coverage

**Files:**
- Modify: `turbo.json`, `package.json` (root)
- Modify: `apps/web/vitest.config.ts`, `apps/agents/vitest.config.ts`, `packages/twin/vitest.config.ts`, `apps/payload/vitest.config.mts`
- Modify: `apps/web/package.json`, `apps/agents/package.json`, `packages/twin/package.json`, `apps/payload/package.json` (devDependency), `bun.lock`
- Modify: `.gitignore` (already ignores `coverage`; verify)

Turbo 2 runs tasks in strict env mode. A variable that isn't declared in `env`/`passThroughEnv` doesn't reach the task. CI passes database URLs to tests and throwaway secrets to the web build. The bundle scan relies on those secrets reaching `next build`; without them the scan proves nothing.

- [ ] **Step 1: Add the coverage provider to each tested package**

Run these four commands, one per call. The versions must match each package's vitest exactly: 5.0.3 for agents/twin/web, 4.0.18 for cms.

```bash
bun add -d --cwd apps/web @vitest/coverage-v8@5.0.3
bun add -d --cwd apps/agents @vitest/coverage-v8@5.0.3
bun add -d --cwd packages/twin @vitest/coverage-v8@5.0.3
bun add -d --cwd apps/payload @vitest/coverage-v8@4.0.18
```

Then run `git diff --stat bun.lock package.json apps/*/package.json packages/*/package.json`.
Expected: the four `package.json` files each gain one devDependency, and `bun.lock` only adds packages. If an unrelated version moved, stop and report.

- [ ] **Step 2: Configure v8 coverage (off unless `--coverage` is passed)**

In each of the four vitest configs, add a `coverage` key inside the existing `test: { … }` object:

```ts
    // Only with `--coverage` (CI): a summary for the PR report and a text total for the log.
    coverage: { provider: 'v8', reporter: ['text-summary', 'json-summary'], reportsDirectory: './coverage' },
```

For `apps/web/vitest.config.ts`, the `test` object is a one-liner. Rewrite it as:

```ts
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
    // Only with `--coverage` (CI): a summary for the PR report and a text total for the log.
    coverage: { provider: 'v8', reporter: ['text-summary', 'json-summary'], reportsDirectory: './coverage' },
  },
```

- [ ] **Step 3: Update `turbo.json`**

Replace the whole file with:

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "env": ["CMS_URL", "REVALIDATE_SECRET"],
      "passThroughEnv": [
        "PREVIEW_SECRET",
        "TWIN_JWT_SECRET",
        "TWIN_COOKIE_SECRET",
        "TWIN_REDACT_SECRET",
        "TWIN_STABLE_KEY_SECRET",
        "TWIN_BOOKING_REF_SECRET",
        "TWIN_PROMPT_CANARY",
        "TWIN_DATABASE_URL",
        "WORKFLOW_POSTGRES_URL",
        "OPENROUTER_API_KEY",
        "PAYLOAD_MCP_API_KEY",
        "IMESSAGE_PROJECT_SECRET",
        "IMESSAGE_WEBHOOK_SECRET",
        "CAL_WEBHOOK_SECRET",
        "GOOGLE_SERVICE_ACCOUNT_JSON",
        "EXA_API_KEY"
      ],
      "outputs": [".next/**", "!.next/cache/**", "!.next/dev/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "check-types": {
      "dependsOn": ["^check-types"]
    },
    "test": {
      "dependsOn": ["^build"],
      "passThroughEnv": ["DATABASE_URL", "PAYLOAD_SECRET", "TWIN_DATABASE_URL", "WORKFLOW_POSTGRES_URL"],
      "outputs": ["coverage/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

The `passThroughEnv` list for `build` is `SECRET_NAMES` from `scripts/scan-client-bundle.ts` minus `REVALIDATE_SECRET` (already in `env`). Keep the two lists in sync, and say so in a comment at the top of `SECRET_NAMES`:

```ts
/** Server-only env names: none may appear in anything the browser downloads. turbo.json's `build.passThroughEnv` mirrors this list, so the CI build sees the values it scans for. */
```

(Replace the existing doc comment above `export const SECRET_NAMES` with this one.)

- [ ] **Step 4: Root `test` script**

In the root `package.json` `scripts`, add after `"check-types"`:

```json
    "test": "turbo run test",
```

- [ ] **Step 5: Verify tests run through Turbo with coverage**

Run: `bunx turbo run test --filter=@repo/twin --filter=web -- --coverage`
Expected: both pass. `packages/twin/coverage/coverage-summary.json` and `apps/web/coverage/coverage-summary.json` exist.

Run: `bunx turbo run test --filter=agents -- --coverage`
Expected: PASS. `apps/agents/coverage/coverage-summary.json` exists. This proves the arg reaches `vitest run` after `bun run skills &&`.

Run: `bunx turbo run test --filter=cms -- --coverage`
Expected: PASS (it reads `apps/payload/.env` via `dotenv`). `apps/payload/coverage/coverage-summary.json` exists. If it fails only because the args didn't reach vitest through `bun run test:int`, change the `test` script in `apps/payload/package.json` to the same command as `test:int` (`cross-env NODE_OPTIONS=--no-deprecation vitest run --config ./vitest.config.mts`) instead of delegating, and re-run.

Confirm `coverage` is ignored: `git status --short` must not list any `coverage/` directory.

- [ ] **Step 6: Commit**

```bash
git add turbo.json package.json bun.lock apps/web/package.json apps/agents/package.json packages/twin/package.json apps/payload/package.json apps/web/vitest.config.ts apps/agents/vitest.config.ts packages/twin/vitest.config.ts apps/payload/vitest.config.mts scripts/scan-client-bundle.ts
git commit -m "build: tests run through turbo with v8 coverage; build and test see CI's env" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Bring generated files up to date (drift baseline)

**Files (only if they drifted):** `apps/payload/src/migrations/*`, `packages/cms-types/src/payload-types.ts`, `apps/payload/src/app/(payload)/admin/importMap.js`, `packages/twin/migrations/*`, maybe `.prettierignore`

The `drift` job fails when any generator changes a tracked file. This task runs the same four generators locally so the first CI run starts clean, and so a real drift is committed and reviewed rather than discovered in CI.

- [ ] **Step 1: Payload migrations**

Run (PowerShell tool):

```powershell
New-Item -ItemType Directory -Force apps/payload/.tmp | Out-Null; $env:DATABASE_URL='file:./.tmp/drift.db'; $env:PAYLOAD_SECRET='drift-drift-drift-drift-drift-drift-00'; bun run --cwd apps/payload payload migrate:create drift --skip-empty
```

Expected: a message that there are no schema changes, and no new file in `apps/payload/src/migrations`. If a `*_drift.ts`/`.json` pair appears, the committed migrations miss a schema change. Do **not** commit it under the name `drift`. Delete the pair, report it to the controller, and stop this task: this is a real production bug, and the owner names the migration.

If the command prompts interactively or fails because the database is empty, report the exact output. The CI job uses the same command, so it must work non-interactively.

Then delete the throwaway database: `rm -f apps/payload/.tmp/drift.db*`.

- [ ] **Step 2: Payload types and import map**

Run (PowerShell tool), with the same env as step 1:

```powershell
$env:DATABASE_URL='file:./.tmp/drift.db'; $env:PAYLOAD_SECRET='drift-drift-drift-drift-drift-drift-00'; bun run --cwd apps/payload generate:types; bun run --cwd apps/payload generate:importmap
```

Then run `git status --short` and `git diff --stat`.

- If `packages/cms-types/src/payload-types.ts` changed, inspect `git diff packages/cms-types/src/payload-types.ts`.
  - If the change is real (new or changed fields): it is the regenerated file the repo should have. Keep it.
  - If the change is only formatting because someone ran prettier over the generated file, keep the generator's output and add `packages/cms-types/src/payload-types.ts` to a new root `.prettierignore` (one path per line), so `bun run format` never rewrites it again.
- If `importMap.js` changed, keep the regenerated file.

Delete the throwaway database again: `rm -f apps/payload/.tmp/drift.db*`.

- [ ] **Step 3: Twin migrations**

Run: `bun run --cwd packages/twin db:generate`
Expected: `No schema changes, nothing to migrate`. If a new migration appears, report it and stop (same reason as step 1).

- [ ] **Step 4: Commit whatever was regenerated (skip if nothing changed)**

Stage only the files from steps 2–3 that changed, by name. Then:

```bash
git commit -m "chore(cms): regenerate payload types and import map from the config" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Production compose on GHCR images

**Files:**
- Modify: `docker-compose.yml`
- Create: `docker-compose.build.yml`
- Modify: `.env.deploy.example`

Easypanel runs `docker compose up --build -d` on every deploy. A service with `build:` is rebuilt on the server, so the production file must have no `build:`. `pull_policy: always` makes each deploy fetch the tag CI just pushed.

- [ ] **Step 1: Switch the three app services to images**

In `docker-compose.yml`, change the header comment from

```yaml
# Production stack for an Easypanel "Compose" service (docs/deploy-easypanel.md).
```

to

```yaml
# Production stack for an Easypanel "Compose" service (docs/deploy-easypanel.md, docs/ci-cd.md).
# - Images come from GHCR, built and pushed by CI from a green main. IMAGE_TAG picks the release
#   (`latest`, or `sha-<short commit>` to pin or roll back). To build from source instead, add
#   docker-compose.build.yml: docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
```

Replace the `cms` service's

```yaml
    build:
      context: .
      dockerfile: apps/payload/Dockerfile
```

with

```yaml
    image: ${IMAGE_REGISTRY:-ghcr.io/proxziima}/my-portfolio-cms:${IMAGE_TAG:-latest}
    pull_policy: always
```

Do the same for `web` (`my-portfolio-web`, replacing the block with `dockerfile: apps/web/Dockerfile`) and `agents` (`my-portfolio-agents`, replacing the block with `dockerfile: apps/agents/Dockerfile`). Leave everything else unchanged.

- [ ] **Step 2: Create the source-build override**

`docker-compose.build.yml`:

```yaml
# Builds the three app images from this checkout instead of pulling them from GHCR. Layer it on the
# production file (locally, or on a server without registry access):
#   docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
services:
  cms:
    build:
      context: .
      dockerfile: apps/payload/Dockerfile
    pull_policy: build
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    pull_policy: build
  agents:
    build:
      context: .
      dockerfile: apps/agents/Dockerfile
    pull_policy: build
```

- [ ] **Step 3: Add the image variables to the env template**

In `.env.deploy.example`, insert after the first three comment lines (before `# Public origins, …`):

```dotenv
# Images CI publishes to GHCR from a green main (docs/ci-cd.md). IMAGE_TAG picks the release: `latest`
# follows main; `sha-<short commit>` pins one (to roll back, set it and redeploy).
IMAGE_REGISTRY=ghcr.io/proxziima
IMAGE_TAG=latest

```

- [ ] **Step 4: Check the YAML parses**

Run: `bun -e "for (const f of ['docker-compose.yml','docker-compose.build.yml']) { const y = Bun.YAML.parse(await Bun.file(f).text()); console.log(f, Object.keys(y.services)) }"`
Expected: `docker-compose.yml [ "cms", "web", "postgres", "agents" ]` and `docker-compose.build.yml [ "cms", "web", "agents" ]`. The full `docker compose config` check runs in CI (`repo` job).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml docker-compose.build.yml .env.deploy.example
git commit -m "build: production compose pulls the GHCR images; a build override builds from source" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Composite actions (setup, secrets, cms)

**Files:**
- Create: `.github/actions/setup/action.yml`, `.github/actions/secrets/action.yml`, `.github/actions/cms/action.yml`

- [ ] **Step 1: `setup`**

`.github/actions/setup/action.yml`:

```yaml
name: setup
description: Bun and Node, the Bun install and Turbo caches, and the workspace install. Run after checkout.
runs:
  using: composite
  steps:
    - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
      with:
        bun-version: 1.3.10
    - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
      with:
        node-version: 24
    - name: bun install cache
      uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
      with:
        path: ~/.bun/install/cache
        key: bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}
        restore-keys: bun-${{ runner.os }}-
    # Turbo's local cache, per job: a re-run, or the next commit, replays unchanged tasks.
    - name: turbo cache
      uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
      with:
        path: .turbo/cache
        key: turbo-${{ runner.os }}-${{ github.job }}-${{ github.sha }}
        restore-keys: turbo-${{ runner.os }}-${{ github.job }}-
    - name: install
      shell: bash
      run: bun install --frozen-lockfile
```

- [ ] **Step 2: `secrets`**

`.github/actions/secrets/action.yml`:

```yaml
name: throwaway secrets
description: Random, masked values for every secret the stack shares, exported to the rest of the job.
runs:
  using: composite
  steps:
    - shell: bash
      run: |
        for name in PAYLOAD_SECRET REVALIDATE_SECRET PREVIEW_SECRET TWIN_REDACT_SECRET TWIN_JWT_SECRET \
          TWIN_COOKIE_SECRET TWIN_STABLE_KEY_SECRET CAL_WEBHOOK_SECRET TWIN_BOOKING_REF_SECRET; do
          value=$(openssl rand -hex 32)
          echo "::add-mask::$value"
          echo "$name=$value" >> "$GITHUB_ENV"
        done
        canary="canary-$(openssl rand -hex 16)"
        echo "::add-mask::$canary"
        echo "TWIN_PROMPT_CANARY=$canary" >> "$GITHUB_ENV"
```

- [ ] **Step 3: `cms`**

`.github/actions/cms/action.yml`:

```yaml
name: throwaway cms
description: >-
  Builds, migrates, seeds and starts the CMS on :3001 from an empty SQLite file (never payload.db).
  Run after setup and secrets. The log is $RUNNER_TEMP/cms.log.
inputs:
  twin-key:
    description: Also seed the twin's fact, voice sample and MCP key (exports PAYLOAD_MCP_API_KEY, masked).
    default: 'false'
  web-url:
    description: The web origin the CMS allows (CORS) and revalidates.
    default: http://localhost:3000
runs:
  using: composite
  steps:
    # NODE_ENV=production: the first Payload start (here, the seed) applies the committed migrations
    # (prodMigrations) to the empty database instead of pushing a dev schema.
    - name: build, migrate and seed
      shell: bash
      env:
        DATABASE_URL: file:./.tmp/throwaway.db
        NODE_ENV: production
        NEXT_PUBLIC_SERVER_URL: http://127.0.0.1:3001
        WEB_URL: ${{ inputs.web-url }}
      run: |
        mkdir -p apps/payload/.tmp
        bun run --cwd apps/payload build
        bun run --cwd apps/payload seed
    - name: twin seed and MCP key
      if: inputs.twin-key == 'true'
      shell: bash
      env:
        DATABASE_URL: file:./.tmp/throwaway.db
        NODE_ENV: production
        NEXT_PUBLIC_SERVER_URL: http://127.0.0.1:3001
        WEB_URL: ${{ inputs.web-url }}
      run: bun run --cwd apps/payload payload run src/seed/twin-ci.ts
    - name: start
      shell: bash
      env:
        DATABASE_URL: file:./.tmp/throwaway.db
        NODE_ENV: production
        NEXT_PUBLIC_SERVER_URL: http://127.0.0.1:3001
        WEB_URL: ${{ inputs.web-url }}
      run: |
        nohup bun run --cwd apps/payload start > "$RUNNER_TEMP/cms.log" 2>&1 &
        for _ in $(seq 60); do
          curl -fsS http://127.0.0.1:3001/api/globals/profile > /dev/null && exit 0
          sleep 2
        done
        tail -n 100 "$RUNNER_TEMP/cms.log"
        exit 1
```

Before committing, read `apps/payload/src/payload.config.ts` and confirm that `WEB_URL` is the variable it uses for CORS and revalidation. The compose file passes `WEB_URL: ${WEB_PUBLIC_URL}`. If the name differs, use the config's name.

- [ ] **Step 4: Commit**

```bash
git add .github/actions/setup/action.yml .github/actions/secrets/action.yml .github/actions/cms/action.yml
git commit -m "ci: composite actions for setup, throwaway secrets and a throwaway CMS" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The pipeline (`ci.yml`) and Playwright in CI

**Files:**
- Modify (rewrite): `.github/workflows/ci.yml`
- Modify: `apps/web/playwright.config.ts`

- [ ] **Step 1: Playwright uses the production server in CI**

In `apps/web/playwright.config.ts`, replace the `webServer` line and its comment with:

```ts
  // needs the CMS on :3001 with the seed data. Locally an already-running dev server on `port` is reused;
  // CI (CI=true) builds the site first and serves the production build.
  webServer: {
    command: process.env.CI ? 'bun run start' : 'bun run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
```

- [ ] **Step 2: Write the workflow**

Replace `.github/workflows/ci.yml` entirely with:

```yaml
name: ci
on:
  push:
    branches: [main, develop]
  pull_request:
  workflow_dispatch:

# One run per ref. A newer push cancels an older pull-request run; main and develop runs queue so a
# deploy is never cut off.
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read

env:
  TURBO_TELEMETRY_DISABLED: 1
  NEXT_TELEMETRY_DISABLED: 1
  DO_NOT_TRACK: 1

jobs:
  # What this run has to check (scripts/ci/affected.ts). Push, dispatch and repo-wide changes check everything.
  changes:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    outputs:
      all: ${{ steps.affected.outputs.all }}
      web: ${{ steps.affected.outputs.web }}
      cms: ${{ steps.affected.outputs.cms }}
      agents: ${{ steps.affected.outputs.agents }}
      twin: ${{ steps.affected.outputs.twin }}
      images: ${{ steps.affected.outputs.images }}
      affected: ${{ steps.affected.outputs.affected }}
      # Secrets can't be read in a job-level `if`, so this exports whether live evals can run.
      # The value is the boolean, never the secret.
      live-evals: ${{ secrets.OPENROUTER_API_KEY != '' }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: ./.github/actions/setup
      - id: affected
        run: bun scripts/ci/affected.ts

  # Repository-level files: workflow syntax and both compose files.
  repo:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - name: workflows (actionlint + shellcheck)
        run: docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12 -color
      - name: compose files resolve with the template env
        run: |
          docker compose --env-file .env.deploy.example -f docker-compose.yml config --quiet
          docker compose --env-file .env.deploy.example -f docker-compose.yml -f docker-compose.build.yml config --quiet

  # Types, lint and every test suite (with coverage) for the affected workspaces, plus the repo scripts.
  verify:
    needs: changes
    runs-on: ubuntu-latest
    timeout-minutes: 30
    services:
      postgres:
        image: postgres:17-alpine
        # twin_eval on 5433 is what apps/agents/fixtures/offline/.env.example points at.
        env: { POSTGRES_USER: twin, POSTGRES_PASSWORD: twin, POSTGRES_DB: twin_eval }
        ports: ['5433:5432']
        options: >-
          --health-cmd "pg_isready -U twin -d twin_eval" --health-interval 5s --health-timeout 3s --health-retries 10
    env:
      TWIN_DATABASE_URL: postgres://twin:twin@127.0.0.1:5433/twin_eval
      WORKFLOW_POSTGRES_URL: postgres://twin:twin@127.0.0.1:5433/twin_eval
      # Payload's integration tests: a throwaway SQLite file, never payload.db.
      DATABASE_URL: file:./.tmp/ci.db
      PAYLOAD_SECRET: ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-33
      # Empty when everything is checked; otherwise turbo limits itself to the packages the PR affects.
      AFFECTED: ${{ needs.changes.outputs.all != 'true' && '--affected' || '' }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: ./.github/actions/setup
      - name: types and lint
        run: bunx turbo run check-types lint $AFFECTED
      - name: tests with coverage
        run: bunx turbo run test $AFFECTED -- --coverage
      - name: repo scripts
        run: bun test scripts
      - name: upload coverage
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: coverage
          path: |
            apps/*/coverage/coverage-summary.json
            packages/*/coverage/coverage-summary.json
          if-no-files-found: ignore
          retention-days: 7

  # Generated files and migrations must match their sources: a schema change without a migration breaks prod.
  drift:
    needs: changes
    if: needs.changes.outputs.cms == 'true' || needs.changes.outputs.twin == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      DATABASE_URL: file:./.tmp/drift.db
      PAYLOAD_SECRET: ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-33
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ./.github/actions/setup
      - name: payload migrations cover the config
        run: |
          mkdir -p apps/payload/.tmp
          bun run --cwd apps/payload payload migrate:create drift --skip-empty
      - name: payload types
        run: bun run --cwd apps/payload generate:types
      - name: payload import map
        run: bun run --cwd apps/payload generate:importmap
      - name: twin migrations cover the schema
        run: bun run --cwd packages/twin db:generate
      - name: nothing drifted
        run: |
          changed=$(git status --porcelain)
          if [ -n "$changed" ]; then
            echo "$changed"
            git --no-pager diff
            echo "::error::Generated files are stale. See docs/ci-cd.md#when-a-gate-fails: a new migration file means a schema change has none; otherwise regenerate and commit."
            exit 1
          fi

  # The agent builds, discovers every capability and passes the offline acceptance evals.
  agents:
    needs: changes
    if: needs.changes.outputs.agents == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      postgres:
        image: postgres:17-alpine
        env: { POSTGRES_USER: twin, POSTGRES_PASSWORD: twin, POSTGRES_DB: twin_eval }
        ports: ['5433:5432']
        options: >-
          --health-cmd "pg_isready -U twin -d twin_eval" --health-interval 5s --health-timeout 3s --health-retries 10
    env:
      TWIN_DATABASE_URL: postgres://twin:twin@127.0.0.1:5433/twin_eval
      WORKFLOW_POSTGRES_URL: postgres://twin:twin@127.0.0.1:5433/twin_eval
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ./.github/actions/setup
      - name: agent builds and discovers every capability
        run: |
          bun run --cwd apps/agents info
          bun run --cwd apps/agents build
      - name: offline acceptance evals (scripted model, local stubs)
        run: |
          bun run --cwd packages/twin db:migrate
          bun run --cwd apps/agents world:setup
          cd apps/agents/fixtures/offline && cp .env.example .env && bun run eval

  # Every web route that reads the CMS is force-dynamic, so `next build` never fetches it: CMS_URL
  # only has to parse. turbo.json passes these values through to the build, so the scan is meaningful.
  bundle:
    needs: changes
    if: needs.changes.outputs.web == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      TWIN_JWT_SECRET: ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-00
      TWIN_COOKIE_SECRET: ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-11
      TWIN_REDACT_SECRET: ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-22
      TWIN_STABLE_KEY_SECRET: ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-33
      TWIN_BOOKING_REF_SECRET: ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-44
      IMESSAGE_PROJECT_SECRET: ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-55
      IMESSAGE_WEBHOOK_SECRET: ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-88
      CAL_WEBHOOK_SECRET: ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-66
      PAYLOAD_MCP_API_KEY: ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-ci-77
      TWIN_PROMPT_CANARY: ci-canary-0123456789
      CMS_URL: http://127.0.0.1:3001
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ./.github/actions/setup
      - name: client bundle carries no secrets or prompt fragments
        run: |
          bunx turbo run build --filter=web
          bun scripts/scan-client-bundle.ts apps/web/.next/static

  # The site against a seeded throwaway CMS, in Chromium. The twin's endpoints are stubbed in the browser.
  e2e:
    needs: changes
    if: needs.changes.outputs.web == 'true' || needs.changes.outputs.cms == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    services:
      postgres:
        image: postgres:17-alpine
        env: { POSTGRES_USER: twin, POSTGRES_PASSWORD: twin, POSTGRES_DB: twin_eval }
        ports: ['5433:5432']
        options: >-
          --health-cmd "pg_isready -U twin -d twin_eval" --health-interval 5s --health-timeout 3s --health-retries 10
    env:
      CMS_URL: http://127.0.0.1:3001
      TWIN_DATABASE_URL: postgres://twin:twin@127.0.0.1:5433/twin_eval
      # Nothing listens here: the browser-side stubs answer the twin's routes.
      TWIN_AGENT_URL: http://127.0.0.1:1
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ./.github/actions/setup
      - uses: ./.github/actions/secrets
      - uses: ./.github/actions/cms
      - name: playwright version
        id: playwright
        working-directory: apps/web
        run: echo "version=$(bunx playwright --version | awk '{print $2}')" >> "$GITHUB_OUTPUT"
      - name: playwright browsers cache
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.playwright.outputs.version }}
      - name: chromium and its system libraries
        working-directory: apps/web
        run: bunx playwright install --with-deps chromium
      - name: build the site
        run: bunx turbo run build --filter=web
      - name: end-to-end
        env:
          CI: 'true'
        run: bun run --cwd apps/web test:e2e
      - name: playwright report and cms log
        if: failure()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: e2e-report
          path: |
            apps/web/playwright-report
            apps/web/test-results
            ${{ runner.temp }}/cms.log
          retention-days: 7

  # Each affected production image builds (no push). Layers are cached per service.
  docker:
    needs: changes
    if: needs.changes.outputs.images != '[]'
    name: docker (${{ matrix.service }})
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        include: ${{ fromJSON(needs.changes.outputs.images) }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4.4.1
      - uses: docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc # v7.4.0
        with:
          context: .
          file: ${{ matrix.dockerfile }}
          push: false
          build-args: APP_VERSION=${{ github.sha }}
          cache-from: type=gha,scope=${{ matrix.service }}
          cache-to: type=gha,mode=max,scope=${{ matrix.service }}

  # One sticky comment on the PR: what was checked and coverage per package.
  report:
    needs: [changes, verify]
    if: >-
      always() && github.event_name == 'pull_request' &&
      github.event.pull_request.head.repo.full_name == github.repository && needs.verify.result != 'skipped'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: 1.3.10
      # No artifact exists when no test produced coverage; the report says so.
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
        continue-on-error: true
        with:
          name: coverage
          path: coverage-artifact
      - name: render
        env:
          ALL: ${{ needs.changes.outputs.all }}
          AFFECTED: ${{ needs.changes.outputs.affected }}
          VERIFY: ${{ needs.verify.result }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: bun scripts/ci/coverage-report.ts coverage-artifact > "$RUNNER_TEMP/report.md"
      - uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3 # v9.0.0
        env:
          REPORT: ${{ runner.temp }}/report.md
        with:
          script: |
            const fs = require('node:fs')
            const body = fs.readFileSync(process.env.REPORT, 'utf8')
            const marker = '<!-- ci-report -->'
            const { owner, repo } = context.repo
            const issue_number = context.issue.number
            const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number, per_page: 100 })
            const existing = comments.find((c) => c.user?.type === 'Bot' && c.body?.includes(marker))
            if (existing) await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body })
            else await github.rest.issues.createComment({ owner, repo, issue_number, body })

  # The single required check: green when every gate passed or was skipped as unaffected.
  ci-ok:
    needs: [changes, repo, verify, drift, agents, bundle, e2e, docker]
    if: always()
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - env:
          RESULTS: ${{ toJSON(needs) }}
        run: |
          failed=$(echo "$RESULTS" | jq -r 'to_entries[] | select(.value.result == "failure" or .value.result == "cancelled") | .key')
          if [ -n "$failed" ]; then
            echo "::error::failed: $(echo $failed)"
            exit 1
          fi
          echo "every gate passed or was not affected"

  # Live evals against a real model, with a throwaway CMS and agent inside this runner: production
  # agents are internal-only, so nothing outside the compose network can reach them. Spends model credit.
  live-evals:
    needs: [changes, ci-ok]
    if: >-
      needs.changes.outputs.live-evals == 'true' &&
      (github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main'))
    runs-on: ubuntu-latest
    timeout-minutes: 45
    services:
      postgres:
        image: postgres:17-alpine
        env: { POSTGRES_USER: twin, POSTGRES_PASSWORD: twin, POSTGRES_DB: twin_eval }
        ports: ['5433:5432']
        options: >-
          --health-cmd "pg_isready -U twin -d twin_eval" --health-interval 5s --health-timeout 3s --health-retries 10
    env:
      # The agent's env (agentsEnvSchema). Shared secrets come from the secrets action. Google is stubbed;
      # iMessage is left unconfigured (it is optional), so restricted entries are never offered and no approval runs.
      TWIN_DATABASE_URL: postgres://twin:twin@127.0.0.1:5433/twin_eval
      WORKFLOW_POSTGRES_URL: postgres://twin:twin@127.0.0.1:5433/twin_eval
      OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
      # web_search is not asserted by any live eval; a placeholder keeps the env valid without the secret.
      EXA_API_KEY: ${{ secrets.EXA_API_KEY || 'ci-no-exa-key' }}
      CMS_URL: http://127.0.0.1:3001
      PAYLOAD_MCP_URL: http://127.0.0.1:3001/api/mcp
      GOOGLE_SERVICE_ACCOUNT_JSON: eyJjbGllbnRfZW1haWwiOiJvZmZsaW5lQGV4YW1wbGUuY29tIiwicHJpdmF0ZV9rZXkiOiItLS0tLUJFR0lOIFBSSVZBVEUgS0VZLS0tLS1cbm9mZmxpbmVcbi0tLS0tRU5EIFBSSVZBVEUgS0VZLS0tLS1cbiJ9
      GOOGLE_CALENDAR_ID: ci@example.com
      OWNER_TIMEZONE: America/Sao_Paulo
      CAL_LINK: ci/intro
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ./.github/actions/setup
      - uses: ./.github/actions/secrets
      - uses: ./.github/actions/cms
        with:
          twin-key: 'true'
      - name: build and start the agent
        run: |
          bun run --cwd apps/agents build
          bun run --cwd apps/agents world:setup
          bun run --cwd packages/twin db:migrate
          PORT=4100 nohup bun run --cwd apps/agents start > "$RUNNER_TEMP/agent.log" 2>&1 &
          for _ in $(seq 60); do
            curl -fsS http://127.0.0.1:4100/eve/v1/health > /dev/null && exit 0
            sleep 2
          done
          tail -n 100 "$RUNNER_TEMP/agent.log"
          exit 1
      - name: live evals per skill and acceptance
        run: |
          token=$(bun apps/agents/scripts/mint-eval-token.ts)
          echo "::add-mask::$token"
          export EVE_EVAL_AUTH_TOKEN="$token"
          cd apps/agents && bunx eve eval --url http://127.0.0.1:4100 --strict --junit .eve/junit.xml
      - name: eval results and service logs
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: live-evals
          path: |
            apps/agents/.eve/junit.xml
            ${{ runner.temp }}/cms.log
            ${{ runner.temp }}/agent.log
          if-no-files-found: ignore
          retention-days: 14

  # A green main publishes every image to GHCR: latest, main and sha-<short commit>.
  publish:
    needs: [changes, ci-ok]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    name: publish (${{ matrix.service }})
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
      packages: write
    strategy:
      fail-fast: true
      matrix:
        include: ${{ fromJSON(needs.changes.outputs.images) }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4.4.1
      - uses: docker/login-action@dbcb813823bdd20940b903addbd779551569679f # v4.6.0
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@dc802804100637a589fabce1cb79ff13a1411302 # v6.2.0
        with:
          images: ghcr.io/${{ github.repository_owner }}/my-portfolio-${{ matrix.service }}
          tags: |
            type=raw,value=latest
            type=raw,value=main
            type=sha,prefix=sha-
      - uses: docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc # v7.4.0
        with:
          context: .
          file: ${{ matrix.dockerfile }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: APP_VERSION=${{ github.sha }}
          cache-from: type=gha,scope=${{ matrix.service }}
          cache-to: type=gha,mode=max,scope=${{ matrix.service }}

  # Easypanel pulls the new images (pull_policy: always), then production must report this commit.
  deploy:
    needs: publish
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment:
      name: production
      url: ${{ vars.PROD_WEB_URL }}
    concurrency:
      group: deploy-production
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: 1.3.10
      - id: trigger
        name: trigger the Easypanel deploy
        env:
          WEBHOOK: ${{ secrets.EASYPANEL_DEPLOY_WEBHOOK }}
        run: |
          if [ -z "$WEBHOOK" ]; then
            echo "::notice::EASYPANEL_DEPLOY_WEBHOOK is not set: the images are published, nothing was deployed (docs/ci-cd.md)"
            echo "deployed=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          curl -fsS --retry 3 -X POST "$WEBHOOK" > /dev/null
          echo "deployed=true" >> "$GITHUB_OUTPUT"
      - name: production serves this commit
        if: steps.trigger.outputs.deployed == 'true'
        env:
          PROD_WEB_URL: ${{ vars.PROD_WEB_URL }}
          PROD_CMS_URL: ${{ vars.PROD_CMS_URL }}
          EXPECTED_VERSION: ${{ github.sha }}
        run: bun scripts/ci/smoke.ts
```

- [ ] **Step 3: Lint the workflow locally**

Download actionlint into the scratchpad (PowerShell tool, one call):

```powershell
$d = "$env:TEMP\actionlint"; New-Item -ItemType Directory -Force $d | Out-Null; Invoke-WebRequest https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_windows_amd64.zip -OutFile "$d\a.zip"; Expand-Archive -Force "$d\a.zip" $d
```

Run (PowerShell tool): `& "$env:TEMP\actionlint\actionlint.exe" -color`
Expected: no output, exit 0. Shellcheck isn't installed on Windows, so shell findings only show in CI's `repo` job. Fix any finding in the YAML, not by disabling the rule.

- [ ] **Step 4: Run the local equivalents of verify**

Run: `bunx turbo run check-types lint`, then `bun test scripts`, then `bun run --cwd apps/web test`.
Expected: all pass.

Optional e2e check, only if the main checkout's CMS answers on 3001. Run (PowerShell tool): `try { (Invoke-WebRequest http://127.0.0.1:3001/api/globals/profile -UseBasicParsing).StatusCode } catch { 'down' }`.

If it prints 200, run (PowerShell tool, one call):

```powershell
$env:PORT='3100'; $env:CMS_URL='http://127.0.0.1:3001'; $env:CI='true'; bunx turbo run build --filter=web; bun run --cwd apps/web test:e2e
```

Report the pass/fail counts. A failure here is pre-existing unless it involves `webServer`. Report it, don't patch the tests. If the CMS is down, skip this step and say so: CI's `e2e` job is the verification.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml apps/web/playwright.config.ts
git commit -m "ci: affected fan-out pipeline with drift, image, e2e gates, GHCR publish and gated deploy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Security workflow and gitleaks config

**Files:**
- Create: `.github/workflows/security.yml`, `.github/codeql/codeql-config.yml`, `.gitleaks.toml`

- [ ] **Step 1: CodeQL config**

`.github/codeql/codeql-config.yml`:

```yaml
name: my-portfolio
# The cloned reference sites under docs/ are not our code.
paths-ignore:
  - docs/**
```

- [ ] **Step 2: Gitleaks config**

`.gitleaks.toml`:

```toml
# Gitleaks' default rules, minus the placeholders this repo commits on purpose.
title = "my-portfolio"

[extend]
useDefault = true

[[allowlists]]
description = "CI and offline-eval placeholders, env templates and lockfile hashes"
regexes = [
  '''ci-ci-ci-[a-z0-9-]+''',
  '''ci-canary-[0-9a-z]+''',
  '''offline-offline-[a-z0-9-]+''',
  '''replace-with-[a-z0-9-]+''',
  '''drift-drift-[a-z0-9-]+''',
]
paths = [
  '''(^|/)bun\.lock$''',
  '''^apps/agents/fixtures/''',
  '''^docs/template-portfolio/''',
]
```

- [ ] **Step 3: Scan the full history locally**

Download gitleaks (PowerShell tool, one call). Resolve the latest Windows x64 asset first:

```powershell
$d = "$env:TEMP\gitleaks"; New-Item -ItemType Directory -Force $d | Out-Null; gh release download --repo gitleaks/gitleaks --pattern '*windows_x64.zip' --dir $d --clobber; Expand-Archive -Force (Get-ChildItem "$d\*.zip")[0].FullName $d
```

Run (PowerShell tool): `& "$env:TEMP\gitleaks\gitleaks.exe" git . --config .gitleaks.toml --redact --no-banner`

- **No leaks:** continue.
- **A hit that is a placeholder or fixture** (a test value, a stub key in `fixtures/` or `tests/`): narrow the allowlist with a regex or path that covers exactly that value, re-run, and continue.
- **A hit that looks like a real credential:** stop. Do not allowlist it. Report the file, commit and rule (redacted output only) to the controller. The owner has to rotate it.

- [ ] **Step 4: The workflow**

`.github/workflows/security.yml`:

```yaml
name: security
on:
  pull_request:
  push:
    branches: [main, develop]
  schedule:
    - cron: '23 5 * * 1' # Mondays 05:23 UTC: new CodeQL queries and gitleaks rules against an unchanged tree
  workflow_dispatch:

concurrency:
  group: security-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read

jobs:
  codeql:
    name: codeql (${{ matrix.language }})
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
      security-events: write
      actions: read
    strategy:
      fail-fast: false
      matrix:
        # `actions` scans the workflows themselves (script injection, untrusted checkouts).
        language: [javascript-typescript, actions]
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2 # v4.38.2
        with:
          languages: ${{ matrix.language }}
          build-mode: none
          config-file: ./.github/codeql/codeql-config.yml
      - uses: github/codeql-action/analyze@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2 # v4.38.2
        with:
          category: /language:${{ matrix.language }}

  # New dependencies in a PR: fail on a known high-severity vulnerability.
  dependency-review:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294 # v5.0.0
        with:
          fail-on-severity: high

  # Secrets in the commits this event brings (the whole history on a schedule or manual run).
  gitleaks:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e # v3.0.0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_CONFIG: .gitleaks.toml
          GITLEAKS_ENABLE_COMMENTS: 'false'
```

- [ ] **Step 5: Lint**

Run (PowerShell tool): `& "$env:TEMP\actionlint\actionlint.exe" -color`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/security.yml .github/codeql/codeql-config.yml .gitleaks.toml
git commit -m "ci: CodeQL, dependency review and gitleaks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Labels, Dependabot and the main ruleset

**Files:**
- Create: `.github/workflows/pr.yml`, `.github/labeler.yml`, `.github/dependabot.yml`, `.github/rulesets/main.json`

- [ ] **Step 1: Labeler config**

`.github/labeler.yml`:

```yaml
'area:web':
  - changed-files:
      - any-glob-to-any-file: ['apps/web/**']
'area:cms':
  - changed-files:
      - any-glob-to-any-file: ['apps/payload/**', 'packages/cms-types/**']
'area:agents':
  - changed-files:
      - any-glob-to-any-file: ['apps/agents/**']
'area:twin':
  - changed-files:
      - any-glob-to-any-file: ['packages/twin/**']
'area:infra':
  - changed-files:
      - any-glob-to-any-file:
          - '.github/**'
          - 'docker-compose*.yml'
          - '.dockerignore'
          - '**/Dockerfile'
          - 'turbo.json'
          - 'package.json'
          - 'bun.lock'
          - 'scripts/**'
          - '.env.deploy.example'
'area:docs':
  - changed-files:
      - any-glob-to-any-file: ['docs/**', '**/*.md']
```

- [ ] **Step 2: Labeler workflow**

`.github/workflows/pr.yml`:

```yaml
name: pr
# pull_request_target runs with the base branch's workflow and config and never checks out PR code,
# so labels work on fork PRs without exposing the token to their code.
on:
  pull_request_target:
    types: [opened, synchronize, reopened]

permissions: {}

jobs:
  label:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/labeler@bf12e9b00b37c5c0ca2b87b79b2daf7891dbda13 # v7.0.0
        with:
          sync-labels: true
```

- [ ] **Step 3: Dependabot**

`.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: bun
    directory: /
    target-branch: develop
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 10
    groups:
      bun-minor-and-patch:
        update-types: [minor, patch]

  - package-ecosystem: github-actions
    directories: [/, /.github/actions/setup, /.github/actions/secrets, /.github/actions/cms]
    target-branch: develop
    schedule:
      interval: weekly
      day: monday
    groups:
      actions:
        patterns: ['*']

  - package-ecosystem: docker
    directories: [/apps/web, /apps/payload, /apps/agents]
    target-branch: develop
    schedule:
      interval: weekly
      day: monday
    groups:
      base-images:
        patterns: ['*']
    ignore:
      # Node's major is pinned by package.json engines (24.x); bun's by devEngines. Bump those by hand.
      - dependency-name: node
        update-types: [version-update:semver-major]
      - dependency-name: oven/bun
        update-types: [version-update:semver-major, version-update:semver-minor]

  - package-ecosystem: docker-compose
    directories: [/]
    target-branch: develop
    schedule:
      interval: weekly
      day: monday
    ignore:
      # A Postgres major needs a dump and restore of the twin-pg volume; never automatic.
      - dependency-name: postgres
        update-types: [version-update:semver-major]
```

- [ ] **Step 4: Ruleset for `main` (applied by the owner after merge)**

`.github/rulesets/main.json`:

```json
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/main"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "ci-ok" }]
      }
    }
  ],
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }]
}
```

(`actor_id` 5 is the repository Admin role. It can merge a PR past a failing check in an emergency, but nobody can push to `main` directly.)

- [ ] **Step 5: Lint and validate**

Run (PowerShell tool): `& "$env:TEMP\actionlint\actionlint.exe" -color`. Expected: exit 0.
Run: `bun -e "for (const f of ['.github/labeler.yml','.github/dependabot.yml']) Bun.YAML.parse(await Bun.file(f).text()); JSON.parse(await Bun.file('.github/rulesets/main.json').text()); console.log('ok')"`. Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/pr.yml .github/labeler.yml .github/dependabot.yml .github/rulesets/main.json
git commit -m "ci: path labels, grouped Dependabot updates and the main ruleset" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Documentation

**Files:**
- Create: `docs/ci-cd.md`
- Modify: `docs/deploy-easypanel.md`, `README.md`

- [ ] **Step 1: `docs/ci-cd.md`**

```markdown
# CI/CD

Every pull request and every push to `main` or `develop` runs `.github/workflows/ci.yml`. A green `main`
publishes the production images to GHCR and deploys them to Easypanel.

## The pipeline

`changes` decides what a run checks (`scripts/ci/affected.ts`). On a pull request, only the workspaces
Turborepo reports as affected (and everything that depends on them) are checked. A change to `bun.lock`, a root
config file, a compose file, `.dockerignore`, `.github/` or `scripts/` checks everything, and so does every push.

| Job | Runs when | Gate |
| --- | --- | --- |
| `repo` | always | actionlint (with shellcheck) on the workflows; both compose files resolve with `.env.deploy.example` |
| `verify` | always | `check-types`, `lint` and `test` (with coverage) for the affected workspaces; `bun test scripts` |
| `drift` | cms or twin | Payload migrations, `payload-types.ts`, the admin import map and the twin's drizzle migrations match their sources |
| `agents` | agents | `eve info` + build; offline acceptance evals |
| `bundle` | web | the client bundle carries no secret names, values or prompt fragments |
| `e2e` | web or cms | Playwright against a seeded throwaway CMS and the production build of the site |
| `docker` | per affected image | the image builds (no push) |
| `report` | pull requests | one comment: what was checked, coverage per package |
| `ci-ok` | always | green when every gate above passed or was skipped as unaffected: the required check |
| `live-evals` | push to main, manual | real-model evals (spends OpenRouter credit; never blocks a deploy) |
| `publish` | push to main, after `ci-ok` | pushes `ghcr.io/proxziima/my-portfolio-{web,cms,agents}` as `latest`, `main` and `sha-<short>` |
| `deploy` | after `publish` | calls Easypanel's deploy trigger, then waits until `/api/health` reports the commit and the CMS answers |

`security.yml` runs CodeQL (TypeScript and the workflows themselves), dependency review (PRs) and gitleaks on
every PR and push, and weekly. `pr.yml` labels PRs by area. Dependabot opens grouped weekly updates against
`develop`.

## When a gate fails

- **drift:** the job log names the command. A new file under `apps/payload/src/migrations` means a schema
  change has no migration: create it against a throwaway database (see
  [deploy-easypanel.md](deploy-easypanel.md#updating)) and commit it. Otherwise regenerate and commit:
  `bun run --cwd apps/payload generate:types`, `generate:importmap`, `bun run --cwd packages/twin db:generate`.
- **e2e:** download the `e2e-report` artifact (Playwright report, traces, CMS log).
- **live-evals:** the `live-evals` artifact has the JUnit report and both service logs.
- **deploy:** the log shows the last answer from production. Check the Easypanel deployment log.

## Run the gates locally

```bash
bunx turbo run check-types lint
bunx turbo run test -- --coverage
bun test scripts
```

## One-time setup (repository owner)

1. **Easypanel:** in the Compose service, turn **auto-deploy off**: CI deploys after the checks pass. Copy the
   service's **Deployment Trigger** URL (Deployments tab).
2. **GitHub → Settings → Environments → `production`** (created by the first deploy run, or create it): add
   the secret `EASYPANEL_DEPLOY_WEBHOOK` (the trigger URL) and the variables `PROD_WEB_URL` and `PROD_CMS_URL`
   (public origins, no trailing slash). Until the secret exists, `deploy` publishes the images and skips the
   deploy with a notice.
3. **GHCR:** after the first `publish`, open each package (`my-portfolio-web`, `-cms`, `-agents`) under your
   profile's **Packages** and set its visibility to **public**, so Easypanel pulls without credentials. Keep them
   private instead by adding a registry credential in Easypanel (a token with `read:packages`).
4. **Secret scanning:** Settings → Code security → enable **Secret scanning** and **Push protection**.
5. **Ruleset:** once this workflow is on `main` (so the `ci-ok` check exists), protect `main`:
   ```bash
   gh api -X POST repos/proxziima/my-portfolio/rulesets --input .github/rulesets/main.json
   ```

## Rollback

Set `IMAGE_TAG=sha-<short commit>` (any earlier green `main`) in the Easypanel service's environment and deploy.
Set it back to `latest` to follow `main` again.
```

- [ ] **Step 2: Update `docs/deploy-easypanel.md`**

Make these edits:

1. **Intro paragraph** (after the services table). Replace the sentence `Every image is built from the repository root, and every setting is read at runtime, so nothing environment-specific is baked into an image.` with:
   `CI builds the three app images from the repository root and publishes them to GHCR (`ghcr.io/proxziima/my-portfolio-{web,cms,agents}`) from a green `main`. Easypanel pulls them; it builds nothing. Every setting is read at runtime, so nothing environment-specific is baked into an image. The pipeline is described in [ci-cd.md](ci-cd.md).`
2. **Table, column "Image":** change the three app rows to name the GHCR image and the Dockerfile it's built from, e.g. `` `my-portfolio-web` (`apps/web/Dockerfile`): Next standalone server ``.
3. **Section 1, step 2:** append: `Easypanel still reads `docker-compose.yml` from the repository, but the app services only have an `image:`, so a deploy pulls the images CI published. Turn **auto-deploy off**: CI triggers the deploy after its checks pass (see [ci-cd.md](ci-cd.md#one-time-setup-repository-owner)).`
4. **Section 2 table:** add the first row `| `IMAGE_REGISTRY`, `IMAGE_TAG` | cms, web, agents | Where the images come from. Keep `ghcr.io/proxziima` and `latest`; set `IMAGE_TAG=sha-<short>` to pin a release or roll back. |`.
5. **Section 5, step 1:** replace `Click **Deploy**. Both images build (a few minutes: `bun install`, then `turbo run build`; `next/font/google` downloads the fonts during the web build, so the build needs network access).` with `Click **Deploy** (or push to `main` once the deploy trigger is set up). Easypanel pulls the three images from GHCR. The GHCR packages must be public, or Easypanel needs a registry credential ([ci-cd.md](ci-cd.md#one-time-setup-repository-owner)).`
6. **"Updating" section, first paragraph:** replace `Push to the deployed branch, then click **Deploy** (or enable Easypanel's auto-deploy for the service). The images are rebuilt from the new commit and the containers are replaced;` with `Merge into `main`. CI checks it, publishes the images and triggers the deploy. Easypanel pulls the new images and replaces the containers;`. Keep the rest of the paragraph.
7. **Add a section before "Backups":**

```markdown
## Building from source instead

To build the images on the server (or locally) instead of pulling them, layer the build override:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build -d
```

Easypanel can't do this by itself (it uses one compose file), so this is for a server you run by hand.
`next/font/google` downloads the fonts during the web build, so the build needs network access.
```

8. **"Line endings" section:** replace `Easypanel builds from Git, so its checkout has the line endings in the repository.` with `CI builds the images from a Linux checkout, so they have the line endings in the repository.`

- [ ] **Step 3: README**

In `README.md`, add a section right after the Runbook section:

```markdown
## CI/CD

Pull requests and pushes run the affected checks (types, lint, tests with coverage, generated-file drift,
image builds, e2e, evals) plus CodeQL, dependency review and gitleaks. A green `main` publishes the images to
GHCR and deploys to Easypanel. See [docs/ci-cd.md](docs/ci-cd.md).
```

- [ ] **Step 4: Commit**

```bash
git add docs/ci-cd.md docs/deploy-easypanel.md README.md
git commit -m "docs: the CI/CD pipeline, its one-time setup and the image-based deploy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Final local verification

- [ ] **Step 1: Every local gate**

Run each separately:
- `bunx turbo run check-types lint`
- `bunx turbo run test -- --coverage`
- `bun test scripts`
- PowerShell: `& "$env:TEMP\actionlint\actionlint.exe" -color`
- PowerShell: `& "$env:TEMP\gitleaks\gitleaks.exe" git . --config .gitleaks.toml --redact --no-banner`

Expected: all exit 0. Report counts.

- [ ] **Step 2: Nothing stray**

Run: `git status --short`
Expected: clean. No `coverage/`, `.tmp/`, or downloaded binaries in the tree.

- [ ] **Step 3: Hand off**

CI verification (the PR's checks, a deliberate drift failure, the first `publish`/`deploy`) needs a push. The controller asks the owner before pushing.
