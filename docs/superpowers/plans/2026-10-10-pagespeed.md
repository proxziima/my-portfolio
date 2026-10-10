# PageSpeed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production PageSpeed ≥ 90 on mobile and desktop, CLS ≤ 0.02 under real throttling, and desktop page weight at load under 1.5 MB (from 8.9 MB), with verified visual parity of the desk, the figure and the CRT layers, and no feature removed.

**Architecture:**
- **Phase 1** fixes the font-fallback reflow that causes CLS, inlines the small CSS, and makes hashed media immutable. It moves every desk and theme asset behind a committed, re-runnable pipeline: sharp, gltf-transform with meshopt, and ffmpeg with a parity-gated CRF search. The pipeline writes hashed files to `public/assets/` and a generated TS manifest.
- **Phase 2** powers the monitor's `/os` iframe on visitor intent through a pure state machine. It turns the letter's root into a Server Component with client islands, loads posthog-js lazily, and code-splits the OS apps.
- **Phase 3** moves the desk's WebGL rendering into a worker (OffscreenCanvas). The camera rig and CSS3D stay on the main thread, and worker frames come back as ImageBitmaps applied in the same task as the matching CSS3D transform. A main-thread host with the same scene code is the fallback. Lighthouse CI budgets and PostHog web-vitals alerts close the loop.

**Tech Stack:** Next.js 16.3.4 (App Router, Turbopack, `experimental.inlineCss`), React 19.2, three 0.186 (WebGLRenderer, CSS3DRenderer, GLTFLoader, ImageBitmapLoader, MeshoptDecoder), sharp 0.35.5, @gltf-transform/core|functions|extensions 4.5.1, meshoptimizer 1.3.0, ffmpeg ≥ 7 (system, with libsvtav1, libvpx-vp9, libx264, libvmaf), @capsizecss/metrics 4.3.0, fontkit 2.0.4, wawoff2 2.0.1, pixelmatch 8.0.0, pngjs 7.0.0, Lighthouse 13.5.0, @lhci/cli 0.15.1, @posthog/cli 0.18.10 (bunx, pinned), vitest 5, Playwright 1.63, bun 1.3.10.

**Spec:** `docs/superpowers/specs/2026-10-10-pagespeed-design.md` (read §1.2 and §2 first: the measured causes and where this plan departs from the first draft).

**Repo rules for every task:**
- Run commands from the worktree root `D:/Second Brain/01.PROJETOS/applications/my-portfolio/.claude/worktrees/perf-pagespeed` unless a step says otherwise. Web commands run from `apps/web`.
- Git: one git command per Bash call. No compound commands mentioning git (`&&`, `;`, `|`).
- Never touch `apps/payload/payload.db`. The CMS for local runs is `apps/payload/payload.e2e.db` on port 3201. Never use ports 3000 or 3001 (the main checkout); web runs on 3100.
- Playwright-driven Node scripts (`scripts/perf/*.ts`, parity capture) run with **`node`**, not bun: Playwright's browser launch hangs under bun on this Windows machine. Node 24 strips the TS types natively.
- ESLint ignores TS here; `bun run --cwd apps/web check-types` and the tests are the gate.
- Match the surrounding style: 2-space indent, single quotes, no semicolons, and JSDoc one-liners that explain *why*.
- Tests never hit the network.
- The e2e suite needs the CMS on 3201 and the web server on 3100: `$env:PORT='3100'; bun run --cwd apps/web test:e2e` with the dev server, or a production build started by `--serve`.

**Local servers (used by many steps):**
- CMS, from `apps/payload`, background: `$env:DATABASE_URL='file:./payload.e2e.db'; bunx cross-env NODE_OPTIONS=--no-deprecation next dev --port 3201`
- Web dev, from `apps/web`: `$env:PORT='3100'; bun run dev` (`.env.local` already points `CMS_URL` at 3201)
- Web production: `bunx next build`, then `bunx next start -p 3100` (or the scripts' `--serve`)
- Stop every server you start.

---

## File map

**Create**
- `apps/web/scripts/perf/lighthouse.ts`: the reproducible Lighthouse runner (Task 0.1, already written)
- `apps/web/scripts/perf/layout-shifts.ts`: the layout-shift recorder (Task 0.1, already written)
- `apps/web/scripts/perf/chunks.ts`: chunk-to-module report and bundle assertions (Task 2.8)
- `apps/web/scripts/fonts/fallbacks.ts`, `apps/web/styles/font-fallbacks.css` (generated): per-platform matched fallbacks
- `apps/web/tests/e2e/font-fallback.spec.ts`: the line-count equivalence gate
- `apps/web/tests/e2e/visual/desk-parity.spec.ts`, `apps/web/tests/e2e/visual/compare.ts`, `apps/web/tests/e2e/visual/baseline/*.png`: visual parity
- `apps/web/scripts/sourcemaps.ts`: PostHog upload (optional) and map removal
- `apps/web/assets-src/**`: committed asset sources (moved from `public/`)
- `apps/web/scripts/assets/{build,recipes,hash,manifest,tools}.ts`, `stages/{image,model,video,copy,font}.ts`, `parity/{image,video}.ts`, `parity/review.html`
- `apps/web/lib/assets/manifest.ts` (generated), `apps/web/assets-src/manifest.lock.json` (generated)
- `apps/web/lib/assets/texture-format.ts`: AVIF/WebP probe
- `apps/web/features/desk/power.ts`, `apps/web/features/desk/intent.ts`
- `apps/web/features/theme/LightSwitch.tsx`, `apps/web/features/role/RoleControl.tsx`
- `apps/web/features/os/lazy-app.tsx`
- `apps/web/features/desk/gl/{desk-gl,protocol,host,main-host,worker-host,frame-ring}.ts`, `apps/web/features/desk/gl/desk.worker.ts`
- `apps/web/lighthouserc.json`
- Unit tests under `apps/web/tests/unit/{assets,desk,analytics,os,fonts}/…` (named per task)

**Modify**
- `apps/web/package.json`: scripts and devDependencies
- `.gitignore`: `.perf/`
- `apps/web/next.config.js`: `inlineCss`, `headers()`, `productionBrowserSourceMaps`
- `apps/web/app/(site)/layout.tsx`, `apps/web/app/global-not-found.tsx`, `apps/web/app/(os)/os/layout.tsx`, `apps/web/styles/base.css`
- `apps/web/features/figure/{Figure.tsx,Figure.module.css}`
- `apps/web/features/desk/{DeskScene.tsx,engine.ts,assets.ts,config.ts,monitor-screen.ts,screen-events.ts}`
- `apps/web/lib/dom/use-fullscreen.ts`
- `apps/web/features/theme/WallSwitch.tsx`, `apps/web/features/theme/rocker-atlas.ts`
- `apps/web/features/portfolio/Portfolio.tsx`, `apps/web/features/role/RoleHeadline.tsx`
- `apps/web/features/os/{apps.ts,Window.tsx}`, `apps/web/features/os/apps/dos-app.tsx`
- `apps/web/lib/analytics/{init.ts,events.ts}`, `apps/web/features/analytics/Analytics.tsx`
- `apps/web/Dockerfile`, `.github/workflows/ci.yml`
- `docs/observability-tracking-plan.md`, `docs/observability.md`, `docs/deploy-easypanel.md`
- Existing tests: `tests/e2e/figure.spec.ts`, `tests/e2e/layout.spec.ts`, `tests/unit/desk/desk-scene-outcome.test.ts`, `tests/unit/desk/monitor-screen.test.ts`, `tests/unit/desk/screen-events.test.ts`, `tests/unit/analytics/init.test.ts`, `tests/unit/analytics/events.test.ts`, `tests/unit/theme/rocker-atlas.test.ts`

**Delete (moved to `assets-src/` by the pipeline)**
- `apps/web/public/desk/**`, `apps/web/public/theme-switch/**`, `apps/web/app/(os)/fonts/*.ttf`

---

## Task 0: Measurement harness and the visual-parity baseline

Must be complete before any Phase 1 change: the parity baseline is captured from today's code.

### Task 0.1: Commit the perf scripts

Already done: the scripts, the `package.json` entries and `.gitignore` were committed together with this plan. Re-run Step 4 to confirm the setup, then go on to Task 0.2.

**Files:**
- Already written: `apps/web/scripts/perf/lighthouse.ts`, `apps/web/scripts/perf/layout-shifts.ts`
- Modify: `apps/web/package.json`, `.gitignore`

- [ ] **Step 1: Add the scripts to `apps/web/package.json`**

```json
"perf:lighthouse": "node scripts/perf/lighthouse.ts",
"perf:shifts": "node scripts/perf/layout-shifts.ts",
```

- [ ] **Step 2: Ignore local reports.** Append to the root `.gitignore`:

```
# perf reports (scripts/perf)
.perf/
```

- [ ] **Step 3: Type-check**

Run: `bun run --cwd apps/web check-types`
Expected: exit 0.

- [ ] **Step 4: Smoke-run the recorder against production**

Run (from `apps/web`): `node scripts/perf/layout-shifts.ts --url https://felipevinicius.me/ --cpu 6 --runs 1`
Expected: `run 1: CLS 0.148…` with one shift listing `figure … 674 → 650` and four bio `p` sources. This is the bug Task 1.1 fixes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/scripts/perf apps/web/package.json .gitignore
```
```bash
git commit -m "chore(web): reproducible Lighthouse runner and layout-shift recorder"
```

### Task 0.2: Visual parity spec and baseline

**Files:**
- Create: `apps/web/tests/e2e/visual/desk-parity.spec.ts`, `apps/web/tests/e2e/visual/compare.ts`, `apps/web/tests/e2e/visual/baseline/` (PNG)
- Modify: `apps/web/package.json` (devDependencies `pixelmatch@8.0.0`, `pngjs@7.0.0`, `@types/pngjs`; script `test:parity`), `apps/web/playwright.config.ts`

The parity spec is excluded from the normal e2e run (it needs WebGL and the models). It runs with `PARITY=1`.

- [ ] **Step 1: Install**

Run (from `apps/web`): `bun add -d pixelmatch@8.0.0 pngjs@7.0.0 @types/pngjs`

- [ ] **Step 2: Exclude the parity folder unless `PARITY=1`.** In `playwright.config.ts`:

```ts
  testDir: 'tests/e2e',
  // the desk parity shots need WebGL and the real models: run on demand (`bun run test:parity`)
  testIgnore: process.env.PARITY ? [] : ['visual/**'],
```

and in `package.json`: `"test:parity": "cross-env PARITY=1 playwright test tests/e2e/visual --workers 1"`. If `cross-env` is not a web dependency, use `bun add -d cross-env@7.0.3`.

- [ ] **Step 3: Write `tests/e2e/visual/compare.ts`**

```ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

export interface Diff {
  ratio: number
  /** Largest 4-connected cluster of differing pixels, in px². */
  largestCluster: number
}

/** Pixel diff with anti-aliasing ignored; also the biggest connected blob, so a thin sliver at an edge is caught. */
export function comparePng(actualPath: string, baselinePath: string, diffPath: string): Diff {
  const a = PNG.sync.read(readFileSync(actualPath))
  const b = PNG.sync.read(readFileSync(baselinePath))
  if (a.width !== b.width || a.height !== b.height) throw new Error(`size ${a.width}×${a.height} vs ${b.width}×${b.height}`)
  const out = new PNG({ width: a.width, height: a.height })
  const count = pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold: 0.1, includeAA: false })
  mkdirSync(dirname(diffPath), { recursive: true })
  writeFileSync(diffPath, PNG.sync.write(out))
  return { ratio: count / (a.width * a.height), largestCluster: largestCluster(out) }
}

/** pixelmatch paints differing pixels pure red (255,0,0). */
function largestCluster(png: PNG): number {
  const { width, height, data } = png
  const seen = new Uint8Array(width * height)
  const isDiff = (i: number) => data[i * 4] === 255 && data[i * 4 + 1] === 0 && data[i * 4 + 2] === 0
  let best = 0
  const stack: number[] = []
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !isDiff(start)) continue
    let size = 0
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const i = stack.pop()!
      size++
      const x = i % width
      for (const j of [i - 1, i + 1, i - width, i + width]) {
        if (j < 0 || j >= width * height || seen[j] || !isDiff(j)) continue
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === width - 1)) continue
        seen[j] = 1
        stack.push(j)
      }
    }
    best = Math.max(best, size)
  }
  return best
}

export const hasBaseline = (path: string) => existsSync(path)
```

- [ ] **Step 4: Write `tests/e2e/visual/desk-parity.spec.ts`.** It captures when `PARITY_UPDATE=1` (baseline) and compares otherwise.

```ts
import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { openPortfolio } from '../support'
import { comparePng, hasBaseline } from './compare'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const BASE = here('./baseline/')
const OUT = here('../../../test-results/parity/')
const UPDATE = process.env.PARITY_UPDATE === '1'
/** ≤ 0.5 % of pixels may differ, and no differing blob may exceed 64 px² (an edge sliver). */
const MAX_RATIO = 0.005
const MAX_CLUSTER = 64

/** Freezes everything time-based so two runs of the same code produce the same pixels. */
async function freeze(page: Page) {
  await page.addStyleTag({ content: '*{animation-play-state:paused!important;transition:none!important} .screen-jitter{animation:none!important}' })
  await page.evaluate(async () => {
    for (const v of document.querySelectorAll('video')) {
      v.pause()
      v.currentTime = 0
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  })
}

async function ready(page: Page) {
  const scene = page.locator('[data-anchor="desk-scene"]')
  await page.locator('[data-anchor="figure"]').scrollIntoViewIfNeeded()
  await expect(scene).toHaveAttribute('data-loaded', 'true', { timeout: 60_000 })
  // let the OS reach its desktop so the CRT layers are on (power it on first where Phase 2 applies)
  await page.locator('[data-anchor="figure-box"]').hover({ position: { x: 5, y: 5 } })
  await expect(scene.locator('.screen-fx')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 })
  await page.mouse.move(0, 0)
  await page.waitForTimeout(2500) // the rig settles back to rest
}

async function shoot(page: Page, name: string) {
  const box = page.locator('[data-anchor="figure-box"]')
  const actual = `${OUT}${name}.png`
  mkdirSync(OUT, { recursive: true })
  await freeze(page)
  await box.screenshot({ path: actual })
  const baseline = `${BASE}${name}.png`
  if (UPDATE || !hasBaseline(baseline)) {
    mkdirSync(BASE, { recursive: true })
    copyFileSync(actual, baseline)
    return
  }
  const diff = comparePng(actual, baseline, `${OUT}${name}.diff.png`)
  expect.soft(diff.ratio, `${name}: differing pixel ratio`).toBeLessThanOrEqual(MAX_RATIO)
  expect.soft(diff.largestCluster, `${name}: largest differing cluster`).toBeLessThanOrEqual(MAX_CLUSTER)
}

for (const { width, height } of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`desk parity ${width} ${scheme}`, async ({ page }) => {
      test.setTimeout(180_000)
      await page.setViewportSize({ width, height })
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' })
      await openPortfolio(page)
      await ready(page)
      await shoot(page, `desk-${width}-${scheme}`)
      // the monitor pose: hover the screen's centre and let the 2 s tween land
      const box = await page.locator('[data-anchor="figure-box"]').boundingBox()
      if (!box) throw new Error('no box')
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.42)
      await page.waitForTimeout(3000)
      await shoot(page, `monitor-${width}-${scheme}`)
      await page.mouse.move(0, 0)
      await page.waitForTimeout(1500)
      await page.locator('[data-anchor="figure"]').getByRole('button', { name: 'Full screen' }).click()
      await page.waitForTimeout(2000)
      await shoot(page, `fullscreen-${width}-${scheme}`)
    })
  }
}
```

This spec uses `@playwright/test`'s `test`, not `support`'s, because `support` holds the models back.

- [ ] **Step 5: Capture the baseline from today's code**

Run the CMS (3201) and a production build of web on 3100 (see "Local servers"). Then, from `apps/web`:
`$env:PORT='3100'; $env:PARITY_UPDATE='1'; bun run test:parity`
Expected: 4 tests pass and `tests/e2e/visual/baseline/` holds 12 PNGs (desk, monitor and fullscreen × 1440/390 × light/dark). Open three of them and check that the desk, the OS desktop on the monitor and the CRT layers are visible.

- [ ] **Step 6: Prove the comparison is stable**

Run without `PARITY_UPDATE`: `$env:PORT='3100'; bun run test:parity`
Expected: pass, with every ratio ≤ 0.005. If a shot is flaky (the GPU path in headless Chromium), raise the settle waits; do not widen the thresholds.

- [ ] **Step 7: Commit**

```bash
git add apps/web/tests/e2e/visual apps/web/playwright.config.ts apps/web/package.json bun.lock
```
```bash
git commit -m "test(web): desk visual-parity spec and today's baseline shots"
```

### Task 0.3: Record the baseline numbers

- [ ] **Step 1:** With the build and CMS from Task 0.2 running, run from `apps/web`:
  - `node scripts/perf/lighthouse.ts --runs 3 --calibrate --out .perf/baseline-calibrated`
  - `node scripts/perf/lighthouse.ts --runs 2 --throttling devtools --out .perf/baseline-devtools`
  - `node scripts/perf/layout-shifts.ts --cpu 6 --runs 3` and `node scripts/perf/layout-shifts.ts --cpu 6 --runs 3 --width 412 --height 823`

  Expected: numbers in line with spec §1.1 (calibrated mobile ≈ 70, desktop ≈ 91; local CLS 0.148 at 1350 if the local CMS seed has the production bio, otherwise note the value).
- [ ] **Step 2:** Paste the summary lines into the PR description under "Baseline". Nothing is committed (`.perf/` is ignored).

---

## Phase 1: stable layout, delivery, video, assets

### Task 1.1: Per-platform matched font fallbacks and the line-count gate

**Files:**
- Create: `apps/web/tests/e2e/font-fallback.spec.ts`, `apps/web/scripts/fonts/fallbacks.ts`, `apps/web/styles/font-fallbacks.css` (generated), `apps/web/tests/unit/fonts/fallbacks.test.ts`
- Modify: `apps/web/app/(site)/layout.tsx`, `apps/web/app/global-not-found.tsx`, `apps/web/app/globals.css`, `apps/web/styles/base.css`, `apps/web/package.json`

- [ ] **Step 1: Write the failing gate, `tests/e2e/font-fallback.spec.ts`**

```ts
import { expect, type Page } from '@playwright/test'
import { drum, openPortfolio, test } from './support'

/** Heights of the blocks above the figure; a font swap must not change any of them. */
const blocks = (page: Page) =>
  page.evaluate(() => ({
    h1: Math.round(document.querySelector('h1')!.getBoundingClientRect().height),
    bio: [...document.querySelectorAll('[data-anchor="bio"] p')].map((p) => Math.round(p.getBoundingClientRect().height)),
  }))

async function roleCount(page: Page): Promise<number> {
  await drum(page).click()
  const n = await page.getByRole('option').count()
  await page.keyboard.press('Escape')
  return Math.max(1, n)
}

for (const width of [390, 768, 1440]) {
  test(`the fallback face wraps like Inter at ${width}px, for every role`, async ({ browser }) => {
    test.setTimeout(120_000)
    const measure = async (blockFonts: boolean) => {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await context.newPage()
      await page.route('**/*.glb', () => new Promise<void>(() => {}))
      if (blockFonts) await page.route('**/*.woff2', (r) => r.abort())
      await openPortfolio(page)
      await page.evaluate(() => document.fonts.ready)
      const n = await roleCount(page)
      const out = []
      for (let i = 1; i <= n; i++) {
        await page.keyboard.press(String(i))
        await page.waitForTimeout(700) // the word morph settles
        out.push(await blocks(page))
      }
      await context.close()
      return out
    }
    const [fallback, inter] = [await measure(true), await measure(false)]
    expect(fallback).toEqual(inter)
  })
}
```

- [ ] **Step 2: Run it and watch it fail**

Run (dev server on 3100 and CMS on 3201): `$env:PORT='3100'; bunx playwright test tests/e2e/font-fallback.spec.ts`
Expected: FAIL at 1440. The default role's first bio entry is 96 with the fallback and 72 with Inter, the production bug. The other widths may pass or fail; record which.

- [ ] **Step 3: Install the metric sources**

Run (from `apps/web`): `bun add -d @capsizecss/metrics@4.3.0 fontkit@2.0.4 @types/fontkit`

- [ ] **Step 4: Write the pure part with its unit test first.** `tests/unit/fonts/fallbacks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fallbackFace, overrides } from '@/scripts/fonts/fallbacks-core'

const inter = { ascent: 1984, descent: -494, lineGap: 0, unitsPerEm: 2048, xWidthAvg: 1032 }
const arial = { ascent: 1854, descent: -434, lineGap: 67, unitsPerEm: 2048, xWidthAvg: 904 }

describe('fallback overrides', () => {
  it('scales the fallback to the web font width and re-expresses vertical metrics in its em', () => {
    const o = overrides(inter, arial, 1)
    expect(o.sizeAdjust).toBeCloseTo(1032 / 2048 / (904 / 2048), 4)
    expect(o.ascentOverride).toBeCloseTo(1984 / 2048 / o.sizeAdjust, 4)
    expect(o.descentOverride).toBeCloseTo(494 / 2048 / o.sizeAdjust, 4)
    expect(o.lineGapOverride).toBe(0)
  })

  it('applies the measured correction on top of the average-width ratio', () => {
    expect(overrides(inter, arial, 0.98).sizeAdjust).toBeCloseTo(overrides(inter, arial, 1).sizeAdjust * 0.98, 6)
  })

  it('renders one @font-face per local font', () => {
    const css = fallbackFace('Inter Fallback Arial', 'Arial', overrides(inter, arial, 1))
    expect(css).toMatch(/font-family: 'Inter Fallback Arial';/)
    expect(css).toMatch(/src: local\('Arial'\);/)
    expect(css).toMatch(/size-adjust: \d+\.\d+%;/)
  })
})
```

Run: `bun run --cwd apps/web test -- tests/unit/fonts`
Expected: FAIL (module not found).

- [ ] **Step 5: Write `scripts/fonts/fallbacks-core.ts`**

```ts
export interface Metrics {
  ascent: number
  descent: number
  lineGap: number
  unitsPerEm: number
  xWidthAvg: number
}

export interface Overrides {
  sizeAdjust: number
  ascentOverride: number
  descentOverride: number
  lineGapOverride: number
}

/**
 * Capsize's fallback maths: make the fallback's average glyph as wide as the web font's, then express
 * the web font's vertical metrics in the scaled fallback's em, so lines are as tall. `correction` is
 * the measured factor that closes the remaining gap on the site's own text (see fallbacks.ts).
 */
export function overrides(web: Metrics, fallback: Metrics, correction: number): Overrides {
  const sizeAdjust = (web.xWidthAvg / web.unitsPerEm / (fallback.xWidthAvg / fallback.unitsPerEm)) * correction
  return {
    sizeAdjust,
    ascentOverride: web.ascent / web.unitsPerEm / sizeAdjust,
    descentOverride: Math.abs(web.descent) / web.unitsPerEm / sizeAdjust,
    lineGapOverride: web.lineGap / web.unitsPerEm / sizeAdjust,
  }
}

const pct = (n: number) => `${(n * 100).toFixed(4)}%`

export function fallbackFace(family: string, local: string, o: Overrides): string {
  return [
    '@font-face {',
    `  font-family: '${family}';`,
    `  src: local('${local}');`,
    `  size-adjust: ${pct(o.sizeAdjust)};`,
    `  ascent-override: ${pct(o.ascentOverride)};`,
    `  descent-override: ${pct(o.descentOverride)};`,
    `  line-gap-override: ${pct(o.lineGapOverride)};`,
    '}',
  ].join('\n')
}
```

Run: `bun run --cwd apps/web test -- tests/unit/fonts`
Expected: PASS.

- [ ] **Step 6: Write the generator `scripts/fonts/fallbacks.ts`** (run with node; it uses Playwright to measure). Its job:
  1. Read Inter's metrics from the woff2 that next/font ships. Build once, then take the largest `*-s.p.*.woff2` in `.next/static/media` whose `fontkit` family is `Inter`. Use `fontkit.openSync(path)`: `unitsPerEm`, `ascent`, `descent`, `lineGap`, and `xWidthAvg` computed like Capsize (weighted average advance of `abcdefghijklmnopqrstuvwxyz ` by English letter frequency; copy the weights from `@capsizecss/metrics`'s README formula, `xWidthAvg` field).
  2. Take the fallback metrics from `@capsizecss/metrics`: `import segoeUI from '@capsizecss/metrics/segoeUI'`, `roboto`, `helveticaNeue`, `arial`.
  3. Get the site's text from `http://localhost:3100/` (CMS seed): for each role (`1`..`n` keys), collect the bio paragraphs' `textContent` and the h1's.
  4. For each fallback that is installed on this machine, render a hidden measuring page in Playwright Chromium. Each text goes in a `div` at the column width (600 px) and at the weights used (400 bio, 430 `.what`, 620 `.who`, 500 `strong`), once in Inter (served from `.next/static/media`) and once in the fallback face with `correction = 1`. Then binary-search `correction` in [0.95, 1.05] for the smallest maximum of |fallbackWidth − interWidth| / interWidth over every line box (`Range.getClientRects()` per line), which aligns the line breaks. On machines without Segoe UI or Roboto, keep the last committed correction for that face (stored at the top of the generated CSS as `/* correction: … */`) and print which faces were measured.
  5. Write `styles/font-fallbacks.css`: a header saying it is generated, then the four `@font-face` blocks in the order Segoe UI, Roboto, Helvetica Neue, Arial.

  Add to `package.json`: `"fonts:fallbacks": "node scripts/fonts/fallbacks.ts"`.

- [ ] **Step 7: Use the fallbacks.** In `app/(site)/layout.tsx` and `app/global-not-found.tsx`:

```ts
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap', adjustFontFallback: false })
// only Curious mode's notes use it: never preload it ahead of the body face
const caveat = Caveat({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-caveat', display: 'swap', preload: false })
```

In `app/globals.css`, add `@import '../styles/font-fallbacks.css';` before `tokens.css`. In `styles/base.css`, change `body`'s `font-family` to:

```css
  font-family:
    var(--font-inter), 'Inter Fallback Segoe', 'Inter Fallback Roboto', 'Inter Fallback Helvetica', 'Inter Fallback Arial',
    -apple-system, BlinkMacSystemFont, sans-serif;
```

`var(--font-inter)` resolves to `'Inter'` alone now (with `adjustFontFallback: false`, next/font adds no fallback family).

- [ ] **Step 8: Generate and gate**

Run: `bunx next build` (from `apps/web`), start it on 3100, then `bun run fonts:fallbacks`, then rebuild and restart, then `$env:PORT='3100'; bunx playwright test tests/e2e/font-fallback.spec.ts`.
Expected: PASS at 390, 768 and 1440.

**If it still fails after tuning** (some role and width keeps a line difference), apply the spec's escalation (§4.1 item 4): `display: 'optional'` for Inter only. Re-run the gate with the fallback-blocked half skipped for `optional` (the swap never happens, so there is nothing to compare), and record the failing cases from the tuned run in the PR.

- [ ] **Step 9: Verify CLS with the recorder**

Run: `node scripts/perf/layout-shifts.ts --cpu 6 --runs 3` and `… --width 412 --height 823`
Expected: `CLS 0.0000` to `0.02` in 3/3 runs at both sizes.

- [ ] **Step 10: Unit tests and types**

Run: `bun run --cwd apps/web test` and `bun run --cwd apps/web check-types`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add apps/web/scripts/fonts apps/web/styles apps/web/app apps/web/tests/e2e/font-fallback.spec.ts apps/web/tests/unit/fonts apps/web/package.json bun.lock
```
```bash
git commit -m "fix(web): per-platform matched font fallbacks end the 0.15 CLS from the bio reflow"
```

### Task 1.2: The caption row never moves the sections below

**Files:** Modify `apps/web/features/figure/Figure.module.css`

- [ ] **Step 1:** In `.caption`, add `min-height: calc(11.5px * 1.5);` and `line-height: 1.5;` (11.5 px is the caption's font size). A role whose caption wraps to two lines is unaffected (`min-height`, not `height`).
- [ ] **Step 2:** Run `$env:PORT='3100'; bunx playwright test tests/e2e/role.spec.ts tests/e2e/layout.spec.ts`
Expected: pass.
- [ ] **Step 3: Commit**

```bash
git add apps/web/features/figure/Figure.module.css
```
```bash
git commit -m "fix(web): the figure caption keeps one line of height across roles"
```

### Task 1.3: Inline CSS and cache headers

**Files:** Modify `apps/web/next.config.js`. Create `apps/web/tests/unit/next-config.test.ts`.

- [ ] **Step 1: Failing test, `tests/unit/next-config.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import config from '@/next.config.js'

describe('next.config headers', () => {
  it('serves hashed assets as immutable and other public files with a short revalidating cache', async () => {
    const rules = await config.headers!()
    const find = (source: string) => rules.find((r) => r.source === source)?.headers.find((h) => h.key === 'Cache-Control')?.value
    expect(find('/assets/:path*')).toBe('public, max-age=31536000, immutable')
    expect(find('/:file(.*\\.(?:jsdos|wasm|png|ico|css|js))')).toBe('public, max-age=3600, stale-while-revalidate=86400')
  })

  it('inlines the CSS', () => {
    expect(config.experimental?.inlineCss).toBe(true)
  })
})
```

Run: `bun run --cwd apps/web test -- tests/unit/next-config.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement in `next.config.js`**

```js
  experimental: {
    globalNotFound: true,
    // the site's CSS is ~9 KB gzipped and every page is dynamic: inline it, no render-blocking requests
    inlineCss: true,
  },
  async headers() {
    return [
      // content-hashed by scripts/assets: a changed file is a new URL
      { source: '/assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      // unhashed public files (js-dos runtime and bundles, OS icons): a deploy shows within the hour
      { source: '/:file(.*\\.(?:jsdos|wasm|png|ico|css|js))', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' }] },
    ]
  },
```

The second rule's pattern must not match `/_next/static/**`: Next serves those itself with `immutable` and custom headers do not override them. Check in Step 4.

- [ ] **Step 3:** Run the unit test again. Expected: PASS.

- [ ] **Step 4: Verify on a production build**

Run: `bunx next build`, start it on 3100, then:
- `curl -s http://localhost:3100/ | Select-String -Pattern '<style' -SimpleMatch` → at least one match
- `curl -s http://localhost:3100/ | Select-String -Pattern 'rel="stylesheet"' -SimpleMatch` → no match
- `curl -sI http://localhost:3100/js-dos/js-dos.js` → `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`
- `curl -sI http://localhost:3100/_next/static/chunks/<any>.js` → still `public, max-age=31536000, immutable`
- `curl -s http://localhost:3100/os | Select-String '<style'` → match (one global flag)

- [ ] **Step 5:** Run `$env:PORT='3100'; bun run --cwd apps/web test:e2e` against the production server (`reuseExistingServer`). Expected: all pass. The theme script still runs first and the switch still renders without JS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/next.config.js apps/web/tests/unit/next-config.test.ts
```
```bash
git commit -m "perf(web): inline the CSS and give public media real cache lifetimes"
```

### Task 1.4: Private source maps

**Files:** Create `apps/web/scripts/sourcemaps.ts`, `apps/web/tests/unit/sourcemaps.test.ts`. Modify `apps/web/next.config.js`, `apps/web/package.json` (`build` script), `apps/web/Dockerfile`, `.github/workflows/ci.yml`, `docs/deploy-easypanel.md`.

- [ ] **Step 1: Failing test for the map stripper**

```ts
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stripSourceMaps } from '@/scripts/sourcemaps'

describe('stripSourceMaps', () => {
  it('deletes every .map and the sourceMappingURL comments that point at them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'maps-'))
    mkdirSync(join(dir, 'chunks'))
    writeFileSync(join(dir, 'chunks/a.js'), 'console.log(1)\n//# sourceMappingURL=a.js.map')
    writeFileSync(join(dir, 'chunks/a.js.map'), '{}')
    writeFileSync(join(dir, 'chunks/b.css'), 'a{}\n/*# sourceMappingURL=b.css.map */')
    writeFileSync(join(dir, 'chunks/b.css.map'), '{}')
    const removed = stripSourceMaps(dir)
    expect(removed).toBe(2)
    expect(existsSync(join(dir, 'chunks/a.js.map'))).toBe(false)
    expect(readFileSync(join(dir, 'chunks/a.js'), 'utf8')).toBe('console.log(1)\n')
    expect(readFileSync(join(dir, 'chunks/b.css'), 'utf8')).toBe('a{}\n')
  })
})
```

Run: `bun run --cwd apps/web test -- tests/unit/sourcemaps.test.ts` → FAIL.

- [ ] **Step 2: Implement `scripts/sourcemaps.ts`**

```ts
/**
 * After `next build`: give PostHog the browser source maps (when credentials are present), then
 * delete them so no map is ever served. Runs in the Docker build and in CI (`bun run build`).
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAP_COMMENT = /\n?\/[/*][#@] sourceMappingURL=\S+?\.map(?: \*\/)?\s*$/

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

/** Deletes `*.map` under `dir` and the trailing comments that reference them; returns how many maps went. */
export function stripSourceMaps(dir: string): number {
  let removed = 0
  for (const file of walk(dir)) {
    if (file.endsWith('.map')) {
      unlinkSync(file)
      removed++
    } else if (file.endsWith('.js') || file.endsWith('.css')) {
      const text = readFileSync(file, 'utf8')
      const stripped = text.replace(MAP_COMMENT, '\n').replace(/\n+$/, '\n')
      if (stripped !== text) writeFileSync(file, stripped)
    }
  }
  return removed
}

if (import.meta.main) {
  const dir = join(process.cwd(), '.next/static')
  const { POSTHOG_CLI_TOKEN, POSTHOG_CLI_ENV_ID } = process.env
  if (POSTHOG_CLI_TOKEN && POSTHOG_CLI_ENV_ID) {
    for (const args of [['sourcemap', 'inject', '--directory', dir], ['sourcemap', 'upload', '--directory', dir]]) {
      const r = spawnSync('bunx', ['@posthog/cli@0.18.10', ...args], { stdio: 'inherit', shell: process.platform === 'win32' })
      // symbolication is a convenience: a failed upload never fails the build, the maps still go
      if (r.status !== 0) console.warn(`[sourcemaps] posthog-cli ${args[1]} exited ${r.status}`)
    }
  } else console.log('[sourcemaps] no POSTHOG_CLI_TOKEN/POSTHOG_CLI_ENV_ID: upload skipped')
  console.log(`[sourcemaps] removed ${stripSourceMaps(dir)} map(s) from .next/static`)
}
```

Check the exact `posthog-cli` flags against `bunx @posthog/cli@0.18.10 sourcemap --help` before relying on them, and correct the args above if they differ. The test does not cover them.

Run the unit test → PASS.

- [ ] **Step 3: Wire it.** `next.config.js`: `productionBrowserSourceMaps: true,`. `package.json`: `"build": "next build && bun scripts/sourcemaps.ts"`. Turbo's `build` task already runs `bun run build`.

- [ ] **Step 4: Dockerfile.** Replace the build line with:

```dockerfile
# Source maps go to PostHog when the build is given the secret (BuildKit), then are deleted either way.
RUN --mount=type=secret,id=posthog_cli_token,env=POSTHOG_CLI_TOKEN \
    --mount=type=secret,id=posthog_cli_env_id,env=POSTHOG_CLI_ENV_ID \
    bunx turbo run build --filter=web
```

Add `POSTHOG_CLI_TOKEN`/`POSTHOG_CLI_ENV_ID` to turbo.json's `build.passThroughEnv` (not `env`: they must not change the cache key). Document in `docs/deploy-easypanel.md` how to pass the two build secrets, and that nothing breaks without them.

- [ ] **Step 5: Verify**

Run: `bun run --cwd apps/web build`
Expected: `[sourcemaps] removed N map(s)` with N > 0. `Get-ChildItem apps/web/.next/static -Recurse -Filter *.map` finds nothing. `bun scripts/scan-client-bundle.ts apps/web/.next/static` passes (CI order unchanged: the scan runs after `turbo run build`, which now includes the strip).

- [ ] **Step 6: Commit**

```bash
git add apps/web/scripts/sourcemaps.ts apps/web/tests/unit/sourcemaps.test.ts apps/web/next.config.js apps/web/package.json apps/web/Dockerfile turbo.json docs/deploy-easypanel.md
```
```bash
git commit -m "feat(web): private source maps for PostHog symbolication, never served"
```

### Task 1.5: Asset pipeline core (hash, manifest, recipes, check, copy)

**Files:**
- Create: `apps/web/scripts/assets/{build,recipes,hash,manifest,tools}.ts`, `apps/web/scripts/assets/stages/copy.ts`, `apps/web/tests/unit/assets/{hash,manifest,recipes,check}.test.ts`
- Modify: `apps/web/package.json` (`assets:build`, `assets:check`), `apps/web/vitest.config.ts` if needed
- Create: `apps/web/assets-src/` by moving `apps/web/public/desk/**` and `apps/web/public/theme-switch/**` with `git mv` (one git command per file group)

**Design (non-obvious part):** a recipe is pure data. `build.ts` turns recipes into outputs and a manifest. The manifest is TS so imports are typed and tree-shaken.

```ts
// scripts/assets/recipes.ts
export type Recipe =
  | { id: string; kind: 'copy'; source: string }
  | { id: string; kind: 'image'; source: string; widths: number[] | 'source'; formats: Array<'avif' | 'webp'>; parity: ImageParity }
  | { id: string; kind: 'texture'; source: string; parity: ImageParity }
  | { id: string; kind: 'model'; source: string; quantize: { position: number; texcoord: number } }
  | { id: string; kind: 'video'; source: string; codecs: Array<'av1' | 'vp9' | 'h264'>; layer: { opacity: number } }
  | { id: string; kind: 'font'; source: string }

export interface ImageParity {
  /** Minimum SSIM against the source. */
  ssim: number
  /** Judge the image composited as the page draws it (plus-lighter at this opacity over the screen slab). */
  composite?: { mode: 'plus-lighter' | 'normal'; opacity: number }
}

/** Dotted ids become the manifest's nesting: 'desk.computer.model' → ASSETS.desk.computer.model. */
export const RECIPES: readonly Recipe[] = [
  { id: 'desk.computer.model', kind: 'model', source: 'desk/computer.glb', quantize: { position: 16, texcoord: 16 } },
  { id: 'desk.decor.model', kind: 'model', source: 'desk/decor.glb', quantize: { position: 16, texcoord: 16 } },
  { id: 'desk.environment.model', kind: 'model', source: 'desk/environment.glb', quantize: { position: 16, texcoord: 16 } },
  { id: 'desk.computer.texture', kind: 'texture', source: 'desk/computer.webp', parity: { ssim: 0.995 } },
  { id: 'desk.decor.texture', kind: 'texture', source: 'desk/decor.webp', parity: { ssim: 0.995 } },
  { id: 'desk.environment.texture', kind: 'texture', source: 'desk/environment.webp', parity: { ssim: 0.995 } },
  { id: 'desk.screen.smudges', kind: 'image', source: 'desk/screen/smudges.jpg', widths: [1280, 2048], formats: ['avif', 'webp'], parity: { ssim: 0.998, composite: { mode: 'plus-lighter', opacity: 0.12 } } },
  { id: 'desk.screen.shadow', kind: 'image', source: 'desk/screen/shadow.png', widths: 'source', formats: ['avif', 'webp'], parity: { ssim: 0.995, composite: { mode: 'normal', opacity: 1 } } },
  { id: 'desk.screen.staticBase', kind: 'video', source: 'desk/screen/static-base.mp4', codecs: ['av1', 'vp9', 'h264'], layer: { opacity: 0.5 } },
  { id: 'desk.screen.staticLayer', kind: 'video', source: 'desk/screen/static-layer.mp4', codecs: ['av1', 'vp9', 'h264'], layer: { opacity: 0.1 } },
  ...['key-1', 'key-2', 'key-3', 'key-4', 'key-5', 'key-6', 'mouse-down', 'mouse-up', 'office'].map(
    (n) => ({ id: `desk.audio.${n.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())}`, kind: 'copy', source: `desk/audio/${n}.mp3` }) as const,
  ),
  { id: 'theme.rockerOn', kind: 'image', source: 'theme-switch/rocker-on.webp', widths: [64, 128], formats: ['avif', 'webp'], parity: { ssim: 0.99 } },
  { id: 'theme.rockerOff', kind: 'image', source: 'theme-switch/rocker-off.webp', widths: [64, 128], formats: ['avif', 'webp'], parity: { ssim: 0.99 } },
  { id: 'theme.rockerAtlas', kind: 'image', source: 'theme-switch/rocker-atlas.webp', widths: 'source', formats: ['webp'], parity: { ssim: 0.995 } },
  { id: 'osFonts.millennium', kind: 'font', source: 'fonts/Millennium.ttf' },
  { id: 'osFonts.millenniumBold', kind: 'font', source: 'fonts/Millennium-Bold.ttf' },
]
```

Manifest value shapes (in `lib/assets/manifest.ts`, generated):

```ts
// GENERATED by scripts/assets/build.ts — do not edit. Sources: apps/web/assets-src.
export interface ImageVariant { src: string; width: number; height: number; type: 'image/avif' | 'image/webp' }
export interface ImageAsset { width: number; height: number; variants: readonly ImageVariant[] }
export interface VideoSource { src: string; type: string }
export interface VideoAsset { width: number; height: number; sources: readonly VideoSource[] }
export interface TextureAsset { avif?: string; webp: string; width: number; height: number }
export const ASSETS = {
  desk: {
    computer: { model: '/assets/desk/computer.3f9a1c2b7e.glb', texture: { avif: '…', webp: '…', width: 2048, height: 2048 } },
    // …
    screen: { smudges: { width: 2048, height: 1638, variants: [/* avif 1280, avif 2048, webp 1280, webp 2048 */] }, staticBase: { width: 640, height: 480, sources: [/* av1, vp9, h264 in that order */] } },
    audio: { key1: '/assets/desk/audio/key-1.ab12cd34ef.mp3' /* … */ },
  },
  theme: { /* … */ },
  osFonts: { millennium: 'app/(os)/fonts/Millennium.woff2' /* fonts are written next to the layout, for next/font/local */ },
} as const
```

`manifest.lock.json`: `{ "<id>": { "source": "<sha256>", "recipe": "<sha256 of JSON.stringify(recipe)>", "tools": { "sharp": "0.35.5", "ffmpeg": "8.1.1" }, "outputs": ["/assets/…"], "parity": { … metrics … } } }`.

- [ ] **Step 1: Copy the sources.** Copy, don't move, so every commit until Task 1.10 still builds and serves today's files (PowerShell):

```powershell
Copy-Item -Recurse apps/web/public/desk apps/web/assets-src/desk
Copy-Item -Recurse apps/web/public/theme-switch apps/web/assets-src/theme-switch
New-Item -ItemType Directory -Force apps/web/assets-src/fonts; Copy-Item "apps/web/app/(os)/fonts/*.ttf" apps/web/assets-src/fonts/
```

Task 1.10 deletes the originals once every reference goes through `ASSETS`.

- [ ] **Step 2: Failing tests for the pure parts.** `tests/unit/assets/hash.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { contentHash, hashedName } from '@/scripts/assets/hash'

describe('hash', () => {
  it('is a stable 10-char hex of the bytes', () => {
    expect(contentHash(Buffer.from('abc'))).toBe('ba7816bf8f')
  })
  it('inserts the hash before the extension', () => {
    expect(hashedName('desk/computer.glb', Buffer.from('abc'))).toBe('desk/computer.ba7816bf8f.glb')
    expect(hashedName('desk/screen/smudges.jpg', Buffer.from('abc'), '1280w.avif')).toBe('desk/screen/smudges.1280w.ba7816bf8f.avif')
  })
})
```

`tests/unit/assets/manifest.test.ts`: `toManifestSource({ 'desk.computer.model': '/assets/x.glb', 'desk.audio.key1': '/assets/k.mp3' })` returns TS whose evaluated `ASSETS` (strip the types and `eval` with `new Function`, or import from a temp file with `vitest`'s `vi.importActual`) equals `{ desk: { computer: { model: '/assets/x.glb' }, audio: { key1: '/assets/k.mp3' } } }`. Also: duplicate ids throw, and an id that is both a leaf and a branch throws.

`tests/unit/assets/check.test.ts`: `checkLock(recipes, lock, readSource)` returns `[]` when the hashes match; `[{ id, problem: 'source changed' }]` when a source hash differs; `'recipe changed'` when the recipe JSON differs; `'not built'` when the id is missing; `'output missing'` when a listed output file does not exist (inject `exists`).

`tests/unit/assets/recipes.test.ts`: every recipe's `source` exists under `assets-src/`, ids are unique, and every `video` recipe lists `av1` before `vp9` before `h264` (source order is selection order).

Run: `bun run --cwd apps/web test -- tests/unit/assets` → FAIL.

- [ ] **Step 3: Implement `hash.ts`, `manifest.ts` (`toManifestSource`, `writeManifest`, `checkLock`), `recipes.ts`, `stages/copy.ts`, `tools.ts` and `build.ts`.**

`tools.ts`:

```ts
import { spawnSync } from 'node:child_process'

const REQUIRED_ENCODERS = ['libsvtav1', 'libvpx-vp9', 'libx264'] as const

/** The system ffmpeg, verified; only video recipes need it. Fails with install hints rather than producing worse files. */
export function ffmpeg(): { bin: string; version: string } {
  const v = spawnSync('ffmpeg', ['-hide_banner', '-version'], { encoding: 'utf8' })
  if (v.status !== 0) throw new Error('ffmpeg not found. Install it once: winget install Gyan.FFmpeg | brew install ffmpeg | apt install ffmpeg')
  const version = /ffmpeg version (\S+)/.exec(v.stdout)?.[1] ?? 'unknown'
  if (Number.parseInt(version, 10) < 7) throw new Error(`ffmpeg ${version} is too old: need ≥ 7`)
  const enc = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout
  const missing = REQUIRED_ENCODERS.filter((e) => !enc.includes(` ${e} `))
  if (missing.length) throw new Error(`ffmpeg lacks ${missing.join(', ')}: install a full build (gyan.dev "full", or distro ffmpeg with libsvtav1)`)
  const filters = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' }).stdout
  if (!filters.includes(' libvmaf ')) throw new Error('ffmpeg lacks the libvmaf filter, needed by the video parity gate')
  return { bin: 'ffmpeg', version }
}
```

`build.ts` flow:
- Parse `--only <id-prefix>`, `--check`, `--force`.
- `--check`: compute `checkLock` and exit 1 with the problems printed. It needs no encoders.
- Otherwise, for each recipe (filtered), skip it if the lock says the source and recipe hashes are unchanged and the outputs exist (unless `--force`).
- Run the stage, which returns `{ outputs: { path, bytes }[], value: ManifestValue, parity }`, and write the outputs under `public/assets/` with `hashedName`. Delete the previous outputs listed in the lock for that id.
- Write `lib/assets/manifest.ts` and `assets-src/manifest.lock.json`.
- Print a table: id, source bytes, output bytes per variant, parity numbers.

Run: `bun run --cwd apps/web test -- tests/unit/assets` → PASS.

- [ ] **Step 4: Scripts.** `package.json`: `"assets:build": "bun scripts/assets/build.ts"`, `"assets:check": "bun scripts/assets/build.ts --check"`. The image, model and font stages are pure JS/WASM and run under bun. If sharp under bun misbehaves on Windows, switch the script to `node scripts/assets/build.ts` and say so in the commit.

- [ ] **Step 5: Run the copy recipes only**

Run: `bun run --cwd apps/web assets:build --only desk.audio`
Expected: 9 files in `public/assets/desk/audio/*.<hash>.mp3`, and a manifest with `ASSETS.desk.audio.*`.

- [ ] **Step 6: Wire audio to the manifest.** In `features/desk/audio.ts`, replace `DIR` and the literal paths:

```ts
import { ASSETS } from '@/lib/assets/manifest'

const A = ASSETS.desk.audio
const SAMPLES = {
  mouseDown: A.mouseDown,
  mouseUp: A.mouseUp,
  keys: [A.key1, A.key2, A.key3, A.key4, A.key5, A.key6],
  office: A.office,
}
```

- [ ] **Step 7:** `bun run --cwd apps/web test` and `check-types` → pass.

- [ ] **Step 8: Commit** (the sources are copies; the originals stay in `public/` until Task 1.10)

```bash
git add apps/web/scripts/assets apps/web/assets-src apps/web/lib/assets apps/web/public/assets apps/web/tests/unit/assets apps/web/features/desk/audio.ts apps/web/package.json
```
```bash
git commit -m "feat(web): asset pipeline core with hashed outputs, generated manifest and a drift check"
```

### Task 1.6: Images (smudges, shadow, rocker) with parity

**Files:**
- Create: `apps/web/scripts/assets/stages/image.ts`, `apps/web/scripts/assets/parity/image.ts`, `apps/web/tests/unit/assets/image-parity.test.ts`
- Modify: `apps/web/features/desk/monitor-screen.ts`, `apps/web/features/theme/WallSwitch.tsx`, `apps/web/features/theme/rocker-atlas.ts`, `apps/web/tests/unit/theme/rocker-atlas.test.ts`, `apps/web/tests/e2e/layout.spec.ts`

- [ ] **Step 1: Parity function, test first.** `parity/image.ts` exports `ssim(a: RawImage, b: RawImage): number` (a straightforward 8×8-window SSIM on luma, implemented in TS; this avoids an ffmpeg dependency for images) and `composite(layer: RawImage, under: RawImage, mode, opacity): RawImage` (`plus-lighter`: `min(1, under*(1-0.14) + layer*opacity)` per channel, using the veil from `screen-fx.css`; `normal`: alpha over).
  Test: `ssim(x, x) === 1`, `ssim(x, noise) < 0.5`, `composite` of a black layer at any opacity with plus-lighter equals `under * 0.86`.
  Run → FAIL, implement, run → PASS.

- [ ] **Step 2: `stages/image.ts`.**
  - For each width (or the source width) and format: `sharp(src).resize({ width, withoutEnlargement: true })`, then `.avif({ quality: q, effort: 9, chromaSubsampling: '4:4:4' })` or `.webp({ quality: q, effort: 6, smartSubsample: true })`.
  - Search `q` downward from 90 in steps of 4 while parity holds, and keep the last passing value. Parity is computed at the variant's own size against the source resized identically with lanczos3. With `composite`, both are composited over `parity/screen-under.png` (a 640×480 capture of the OS desktop, committed under `scripts/assets/parity/`, made once with the Task 0.2 setup, cropping the screen rect from a monitor-pose shot) scaled to the variant size.
  - Never emit a variant larger than the source file. If the encode is larger, emit the source bytes in the source format, hashed.
  - Returns `ImageAsset`.

- [ ] **Step 3: Build**

Run: `bun run --cwd apps/web assets:build --only desk.screen.smudges` and likewise for `desk.screen.shadow`, `theme.`
Expected (from the probe in spec §4.5): smudges AVIF 1280 ≈ 150 KB or less, shadow AVIF ≈ 2 KB, rocker variants ≈ 2 to 3 KB each, every parity line `pass`.

- [ ] **Step 4: Use them in `monitor-screen.ts`.** Replace `layerImage(className, file)` with a `<picture>` builder:

```ts
import { ASSETS, type ImageAsset } from '@/lib/assets/manifest'

/** A still layer as <picture>: AVIF then WebP, sized by the fixed 1280 px screen (CSS3D only transforms it). */
function layerPicture(className: string, asset: ImageAsset, sizes: string): HTMLPictureElement {
  const picture = document.createElement('picture')
  for (const type of ['image/avif', 'image/webp'] as const) {
    const variants = asset.variants.filter((v) => v.type === type)
    if (!variants.length) continue
    const source = document.createElement('source')
    source.type = type
    source.srcset = variants.map((v) => `${v.src} ${v.width}w`).join(', ')
    source.sizes = sizes
    picture.append(source)
  }
  const img = document.createElement('img')
  const fallback = asset.variants.findLast((v) => v.type === 'image/webp') ?? asset.variants.at(-1)!
  img.src = fallback.src
  img.width = asset.width
  img.height = asset.height
  img.className = className
  img.alt = ''
  img.decoding = 'async'
  img.draggable = false
  picture.append(img)
  return picture
}
```

`fx.append(layerPicture('screen-shadow', ASSETS.desk.screen.shadow, '1280px'), …videos, layerPicture('screen-smudges', ASSETS.desk.screen.smudges, '1280px'))`. In `screen-fx.css`, the `<picture>` must not become a box: add `.screen-fx picture { display: contents; }`, so the `img` keeps its absolute positioning.

The figure e2e test (`fx.locator('img')` count 2) still passes: two `img`s, now inside `picture`s.

- [ ] **Step 5: WallSwitch fallbacks as `<picture>`.** In `WallSwitch.tsx`, the two `<img>` become:

```tsx
<picture>
  <source type="image/avif" srcSet={srcset(ASSETS.theme.rockerOn, 'image/avif')} sizes="2.8rem" />
  <img className={`${styles.image} ${styles.state} ${styles.light}`} src={fallbackSrc(ASSETS.theme.rockerOn)} srcSet={srcset(ASSETS.theme.rockerOn, 'image/webp')} sizes="2.8rem" alt="" width={530} height={700} decoding="async" />
</picture>
```

and likewise for `rockerOff`. Put `srcset`/`fallbackSrc` in `lib/assets/srcset.ts`, with a unit test. `.stage picture { display: contents; }` goes in `WallSwitch.module.css` (`:global(picture)` under `.stage`). `rocker-atlas.ts`: `src: ASSETS.theme.rockerAtlas.variants[0]!.src`. Update `rocker-atlas.test.ts` if it asserts the literal path.

- [ ] **Step 6: Update `layout.spec.ts`'s no-JS test**, which asserts `src` matching `/rocker-on\.webp/`: assert `/rocker-on\.[0-9a-f]{10}\.webp/` on the `img` (its `src` is the WebP fallback) and that the `picture` has an AVIF `source`.

- [ ] **Step 7: Verify**

- `bun run --cwd apps/web test`, `check-types`
- `$env:PORT='3100'; bun run --cwd apps/web test:e2e` (dev server)
- `bun run --cwd apps/web test:parity` against a production build. Expected: pass. The smudges and shadow layers are part of the desk, monitor and fullscreen shots.

- [ ] **Step 8: Commit**

```bash
git add apps/web/scripts/assets apps/web/public/assets apps/web/lib/assets apps/web/assets-src/manifest.lock.json apps/web/features/desk/monitor-screen.ts apps/web/features/desk/screen-fx.css apps/web/features/theme apps/web/tests
```
```bash
git commit -m "perf(web): parity-gated AVIF/WebP for the screen layers and the switch fallbacks"
```

### Task 1.7: Models (meshopt) and textures (ImageBitmapLoader)

**Files:**
- Create: `apps/web/scripts/assets/stages/model.ts`, `apps/web/lib/assets/texture-format.ts`, `apps/web/tests/unit/assets/texture-format.test.ts`, `apps/web/tests/unit/desk/assets.test.ts`
- Modify: `apps/web/scripts/assets/stages/image.ts` (texture kind), `apps/web/features/desk/{assets.ts,config.ts,engine.ts}`, `apps/web/package.json`

- [ ] **Step 1: Install**

Run (from `apps/web`): `bun add -d @gltf-transform/core@4.5.1 @gltf-transform/functions@4.5.1 @gltf-transform/extensions@4.5.1 meshoptimizer@1.3.0 sharp@0.35.5`

- [ ] **Step 2: `stages/model.ts`**

```ts
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, quantize, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

/** Lossless-in-practice geometry compression: 16-bit positions and UVs (12-bit UVs would be ¼ texel on 2048² maps). */
export async function compressModel(input: Uint8Array, q: { position: number; texcoord: number }): Promise<Uint8Array> {
  await MeshoptEncoder.ready
  await MeshoptDecoder.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
  const doc = await io.readBinary(input)
  await doc.transform(dedup(), prune(), weld(), quantize({ quantizePosition: q.position, quantizeTexcoord: q.texcoord }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  return io.writeBinary(doc)
}
```

The stage also checks, before and after, that the node names in each recipe's `drop` list (`Background` for the environment) still exist. `prune` must not rename nodes, and `assets.ts` removes them by name.

- [ ] **Step 3: Texture kind in `stages/image.ts`**: AVIF and WebP at the source size (2048²), each searched for the lowest quality passing SSIM ≥ 0.995 against the source. Omit AVIF if no passing AVIF is smaller than the source WebP. The WebP output is the source bytes if no passing re-encode is smaller. Returns `TextureAsset`.

- [ ] **Step 4: Build**

Run: `bun run --cwd apps/web assets:build --only desk.`
Expected: computer ≈ 45 KB, decor ≈ 40 KB, environment ≈ 36 KB GLBs (spec §2), textures with their parity lines.

- [ ] **Step 5: Texture format probe, test first.** `lib/assets/texture-format.ts`:

```ts
/** A 1×1 AVIF; decoding it with createImageBitmap answers "can this context (window or worker) use AVIF textures". */
const AVIF_1PX = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A='

let cached: Promise<'avif' | 'webp'> | null = null

export function textureFormat(fetchImpl: typeof fetch = fetch, decode: typeof createImageBitmap = createImageBitmap): Promise<'avif' | 'webp'> {
  cached ??= fetchImpl(AVIF_1PX)
    .then((r) => r.blob())
    .then((b) => decode(b))
    .then((bmp) => {
      bmp.close()
      return 'avif' as const
    })
    .catch(() => 'webp' as const)
  return cached
}

/** For tests. */
export const resetTextureFormat = () => {
  cached = null
}
```

Test with injected `fetch`/`decode` (resolve → `avif`; decode rejects → `webp`; a second call is cached). Generate the AVIF data URI with sharp in Step 3 (`sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } }).avif().toBuffer()`), and verify it decodes in Chromium with a one-off `node -e` Playwright check. Use that output instead of the literal above if they differ.

- [ ] **Step 6: Loader, test first.** `tests/unit/desk/assets.test.ts` (node env, three's loaders mocked with `vi.mock('three/addons/loaders/GLTFLoader.js')` and an `ImageBitmapLoader` stub) asserts that `loadDesk`:
  - sets the meshopt decoder on the GLTF loader,
  - picks `texture.avif` when the format is `avif` (else `webp`),
  - creates a `Texture` from the bitmap with `colorSpace = SRGBColorSpace`, `flipY = false`, `needsUpdate = true`,
  - removes the `drop` nodes,
  - calls `bitmap.close()` on dispose.

  Then change `assets.ts`:

```ts
import { ImageBitmapLoader, Mesh, MeshBasicMaterial, SRGBColorSpace, Texture, type Group, type Material } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { MODEL_SCALE, type DeskAsset } from './config'

/** Decodes off the main thread (createImageBitmap) in a window or a worker; glTF UVs need no flip. */
const bitmaps = () => new ImageBitmapLoader().setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none' })

export async function loadDesk(assets: readonly DeskAsset[], format: 'avif' | 'webp'): Promise<LoadedDesk> {
  const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const images = bitmaps()
  const parts = await Promise.all(
    assets.map(async (asset) => {
      const url = (format === 'avif' && asset.texture.avif) || asset.texture.webp
      const [model, bitmap] = await Promise.all([gltf.loadAsync(asset.model), images.loadAsync(url)])
      return { asset, model, bitmap }
    }),
  )
  // … as today, but: const texture = new Texture(parts[i].bitmap); texture.colorSpace = SRGBColorSpace; texture.flipY = false; texture.needsUpdate = true
  // dispose(): also bitmap.close() for each
}
```

`config.ts`: `DeskAsset` becomes `{ model: string; texture: TextureAsset; drop?: readonly string[] }`, and `DESK_ASSETS` reads `ASSETS.desk.*`. `engine.ts` `load()`: `loadDesk(DESK_ASSETS, await textureFormat())`.

Run: `bun run --cwd apps/web test` → PASS.

- [ ] **Step 7: Visual parity**

Run a production build plus `bun run --cwd apps/web test:parity`
Expected: pass. This is the gate for 16-bit quantization and the texture re-encode. If a monitor or fullscreen shot fails at the bezel or keyboard, raise quantization (position 16 is the maximum; check UVs first) or keep the source texture bytes for that map. Never widen the threshold.

- [ ] **Step 8: Commit**

```bash
git add apps/web/scripts/assets apps/web/public/assets apps/web/lib/assets apps/web/assets-src/manifest.lock.json apps/web/features/desk apps/web/tests apps/web/package.json bun.lock
```
```bash
git commit -m "perf(web): meshopt models and off-thread texture decode with AVIF where it passes parity"
```

### Task 1.8: Video encodes with the parity gate

**Files:**
- Create: `apps/web/scripts/assets/stages/video.ts`, `apps/web/scripts/assets/parity/video.ts`, `apps/web/scripts/assets/parity/review.html`, `apps/web/tests/unit/assets/crf-search.test.ts`

- [ ] **Step 1: CRF search as a pure function, test first.**

```ts
// scripts/assets/stages/crf-search.ts
/** Highest CRF in [lo, hi] for which `passes` holds, assuming quality falls monotonically with CRF. Null if even `lo` fails. */
export async function highestPassingCrf(lo: number, hi: number, passes: (crf: number) => Promise<boolean>): Promise<number | null> {
  if (!(await passes(lo))) return null
  let good = lo
  let bad = hi + 1
  while (bad - good > 1) {
    const mid = Math.floor((good + bad) / 2)
    if (await passes(mid)) good = mid
    else bad = mid
  }
  return good
}
```

Test: with `passes = async (c) => c <= 27`, the result is 27 for [16, 40]; with `c <= 10`, null; the predicate is called O(log n) times.

- [ ] **Step 2: `parity/video.ts`**, all through ffmpeg with frame-indexed raw decodes:
  - `decodeY4m(input, out)`: `ffmpeg -i input -map 0:v:0 -fps_mode passthrough -pix_fmt yuv420p out.y4m`
  - `frameCount(y4m)`: `ffprobe -count_frames …`
  - `compositeY4m(layer, under, opacity, out)`: `ffmpeg -i layer.y4m -loop 1 -i under.png -filter_complex "[1:v]scale=640:480,format=gbrp,colorchannelmixer=rr=0.86:gg=0.86:bb=0.86[u];[0:v]format=gbrp,colorchannelmixer=rr=${o}:gg=${o}:bb=${o}[l];[u][l]blend=all_mode=addition,format=yuv420p" -frames:v <n> out.y4m`. This is the veil and `plus-lighter` from `screen-fx.css`, so the gate judges what the page shows.
  - `ssim(a, b)` and `vmaf(a, b)`: `-lavfi "[0:v][1:v]ssim"` / `libvmaf`, parsed as in the experiment (`All:` and `VMAF score:`).
  - `stats(y4m)`: `signalstats` per frame (`YAVG`), plus the luma std from `-vf "format=gray,signalstats"` and a Laplacian high-pass energy (`-vf "format=gray,convolution='0 1 0 1 -4 1 0 1 0':…',signalstats"`, its `YAVG` as energy). Returns averages.
  - `gate(source, encode, opacity)`: frame counts equal; composited SSIM ≥ 0.995 and VMAF ≥ 95; mean luma within ±2 %; luma std ≥ 97 %; HF energy ≥ 95 %. Returns `{ pass, metrics }`.
  - `seam(source)`: SSIM of the last frame against the first, reported only.

- [ ] **Step 3: `stages/video.ts`**: for each codec, run `highestPassingCrf` with the encode commands below, then emit the winner. Order the `sources` av1, vp9, h264.

```
av1:  -map 0:v:0 -an -c:v libsvtav1 -preset 4 -crf {crf} -g 300 -svtav1-params tune=0:enable-tf=0:enable-qm=1 -pix_fmt yuv420p   (.webm, type 'video/webm; codecs="av01.0.04M.08"')
vp9:  -map 0:v:0 -an -c:v libvpx-vp9 -b:v 0 -crf {crf} -row-mt 1 -deadline good -cpu-used 2 -arnr-maxframes 0 -pix_fmt yuv420p   (.webm, 'video/webm; codecs="vp09.00.30.08"')
h264: -map 0:v:0 -an -c:v libx264 -preset veryslow -tune grain -crf {crf} -profile:v main -pix_fmt yuv420p -movflags +faststart  (.mp4, 'video/mp4; codecs="avc1.4D401E"')
```

Ranges: av1 [16, 40], vp9 [16, 40], h264 [14, 28]. If a codec returns null (even the lowest CRF fails), the stage throws: no silent quality loss. Record CRF, bytes and metrics in the lock.

- [ ] **Step 4: Build** (slow: minutes per clip)

Run: `bun run --cwd apps/web assets:build --only desk.screen.static`
Expected: all three codecs pass for both clips. AV1 total about 0.4 to 0.8 MB against 7.37 MB today. Paste the table into the PR.

- [ ] **Step 5: Human review page `parity/review.html`** (local only, not served): two `<video>`s side by side (the source and the chosen encode for one codec, selectable), each composited with the same CSS as `screen-fx.css` over `screen-under.png`, a "blind swap" button that randomises sides, and a frame-step control. Open it with `bunx serve apps/web -p 3300` (any free port other than 3000 and 3001) at `/scripts/assets/parity/review.html`. The owner's sign-off goes in the PR.

- [ ] **Step 6: Commit** (outputs only; the runtime switch is Task 1.9)

```bash
git add apps/web/scripts/assets apps/web/public/assets apps/web/lib/assets apps/web/assets-src/manifest.lock.json apps/web/tests/unit/assets
```
```bash
git commit -m "perf(web): AV1, VP9 and H.264 CRT loops chosen by a composited parity gate"
```

### Task 1.9: Videos at runtime, fetched only once the layers can show

**Files:** Modify `apps/web/features/desk/monitor-screen.ts`, `apps/web/tests/unit/desk/monitor-screen.test.ts`, `apps/web/tests/e2e/figure.spec.ts`

- [ ] **Step 1: Failing unit tests (jsdom) in `monitor-screen.test.ts`:**
  - after `createMonitorScreen`, each `video` has **no** `source` children and `preload === 'none'`;
  - when the fx element's `data-ready` turns `'true'` (simulate: dispatch the iframe `load` with a `contentDocument` containing `[data-anchor="desktop"]`), each video gets three `source`s in the manifest order (`av01` first) and `preload === 'auto'`;
  - `play()` before ready does not call `video.play` (no sources yet); after ready it does (stub `HTMLMediaElement.prototype.play` to resolve);
  - `dispose()` removes the sources and calls `load()`.

  Run → FAIL.

- [ ] **Step 2: Implement.**

```ts
/** A looping static layer with no sources yet: nothing downloads until the layers can be seen (`attachSources`). */
function layerVideo(className: string): HTMLVideoElement {
  const video = document.createElement('video')
  video.className = className
  video.muted = true
  video.loop = true
  video.playsInline = true
  video.preload = 'none'
  video.autoplay = false
  video.disablePictureInPicture = true
  video.setAttribute('aria-hidden', 'true')
  return video
}

/** AV1, then VP9, then H.264: the first the browser can play wins. */
function attachSources(video: HTMLVideoElement, asset: VideoAsset): void {
  if (video.childElementCount) return
  for (const s of asset.sources) {
    const source = document.createElement('source')
    source.src = s.src
    source.type = s.type
    video.append(source)
  }
  video.preload = 'auto'
  video.load()
}
```

`gateOnDesktop`'s `set(ready)` gains an `onFirstReady` callback. On the first `true`, attach the sources to both videos, then, if the screen is currently `playing` (track a `wantPlay` flag set by `play()`/`pause()`), call `play()` on them. `play()` keeps its reduced-motion early return and skips videos without sources. `dispose()` removes the `source` children and calls `load()`.

- [ ] **Step 3:** Run the unit tests → PASS.

- [ ] **Step 4:** `figure.spec.ts`'s first test already waits for `data-ready` and then for a playing video. Run `$env:PORT='3100'; bunx playwright test tests/e2e/figure.spec.ts` → pass. Add one assertion before the `data-ready` wait: `expect(await fx.locator('video source').count()).toBe(0)` is racy once the OS boots fast, so instead assert after ready that the first `source` is `/\.webm$/` with `type` containing `av01`.

- [ ] **Step 5:** `bun run --cwd apps/web test:parity` (production build) → pass. Then confirm by eye in a real browser on localhost: the static runs on the monitor once the desktop shows, in light and dark.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/desk/monitor-screen.ts apps/web/tests/unit/desk/monitor-screen.test.ts apps/web/tests/e2e/figure.spec.ts
```
```bash
git commit -m "perf(web): the CRT loops download only once the layers can show, best codec first"
```

### Task 1.10: Retire the originals, check drift in CI

**Files:** Delete `apps/web/public/desk/**`, `apps/web/public/theme-switch/**`, `apps/web/app/(os)/fonts/*.ttf` (after the font stage). Modify `.github/workflows/ci.yml`, `apps/web/app/(os)/os/layout.tsx`, `apps/web/scripts/assets/stages/font.ts` (new).

- [ ] **Step 1: Font stage.** `bun add -d wawoff2@2.0.1`. `stages/font.ts`: `wawoff2.compress(ttfBytes)` → writes `app/(os)/fonts/<name>.woff2` (**not** hashed and not under `public/`: next/font/local hashes and serves it). Run `bun run --cwd apps/web assets:build --only osFonts`. Then in `app/(os)/os/layout.tsx` change the `src` paths to `../fonts/Millennium.woff2` and `../fonts/Millennium-Bold.woff2`.
- [ ] **Step 2: Find remaining references.** Run `rg -n "/desk/|/theme-switch/|Millennium\.ttf" apps/web --glob '!assets-src/**' --glob '!public/assets/**' --glob '!**/manifest*'`
Expected: no hits other than the files about to be deleted. Fix any hit through `ASSETS`.
- [ ] **Step 3: Delete the originals** (one git command per call):

```bash
git rm -r apps/web/public/desk
```
```bash
git rm -r apps/web/public/theme-switch
```
```bash
git rm "apps/web/app/(os)/fonts/Millennium.ttf" "apps/web/app/(os)/fonts/Millennium-Bold.ttf"
```

- [ ] **Step 4: CI.** In `.github/workflows/ci.yml`, after `bun run --cwd apps/web test`, add `- run: bun run --cwd apps/web assets:check`.
- [ ] **Step 5:** Run `bun run --cwd apps/web assets:check` → exit 0, then the full gate: `test`, `check-types`, e2e (dev), `test:parity` (production build) → all pass.
- [ ] **Step 6: Commit**

```bash
git add -A apps/web .github/workflows/ci.yml
```
```bash
git commit -m "chore(web): serve only pipeline outputs; check asset drift in CI"
```

### Task 1.11: Phase 1 checkpoint

- [ ] **Step 1:** Production build plus CMS. From `apps/web`:
  - `node scripts/perf/lighthouse.ts --serve --runs 3 --calibrate --out .perf/phase1-calibrated --compare .perf/baseline-calibrated/summary.json`
  - `node scripts/perf/lighthouse.ts --serve --runs 2 --throttling devtools --out .perf/phase1-devtools --compare .perf/baseline-devtools/summary.json`
  - `node scripts/perf/layout-shifts.ts --cpu 6 --runs 3` at 1350×940 and 412×823

  Expected: desktop bytes at load down by more than 6 MB (the videos), CLS ≤ 0.02 in the recorder, no render-blocking stylesheet in `summary.json` (`renderBlocking: []`), and TBT unchanged or lower (Phase 1 is mostly bytes and CLS).
- [ ] **Step 2: Visual parity:** `bun run test:parity` → pass. Attach `test-results/parity/*.diff.png` for any non-zero diff to the PR.
- [ ] **Step 3:** After the owner deploys Phase 1, run PSI on production (pagespeed.web.dev) for mobile and desktop and record both in the PR. Expected: desktop CLS ≈ 0, desktop byte weight under 1.5 MB.

---

## Phase 2: power on with intent, smaller client tree, lighter bundles

### Task 2.1: The power state machine and the intent watcher

**Files:** Create `apps/web/features/desk/power.ts`, `apps/web/features/desk/intent.ts`, `apps/web/tests/unit/desk/power.test.ts`, `apps/web/tests/unit/desk/intent.test.ts`

- [ ] **Step 1: `power.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { reducePower } from '@/features/desk/power'

describe('reducePower', () => {
  it('turns on from intent and settles on load', () => {
    expect(reducePower('off', { type: 'intent', source: 'pointer' })).toBe('booting')
    expect(reducePower('booting', { type: 'loaded' })).toBe('on')
  })
  it('ignores repeated intents and an early load', () => {
    expect(reducePower('booting', { type: 'intent', source: 'focus' })).toBe('booting')
    expect(reducePower('on', { type: 'intent', source: 'tap' })).toBe('on')
    expect(reducePower('off', { type: 'loaded' })).toBe('off')
  })
})
```

- [ ] **Step 2: `intent.test.ts`** (jsdom, fake timers, a stub IntersectionObserver that exposes `trigger(ratio)`):
  - a mouse `pointerenter` on the box calls `onIntent('pointer')` once, and later events are ignored (fires once);
  - a touch `pointerenter` does **not** fire `pointer`, and a touch `pointerdown` fires `tap`;
  - `focusin` on the screen fires `focus`;
  - with `coarse = true`, ratio 0.7 held for 800 ms fires `dwell`, and ratio 0.7 then 0.3 before 800 ms does not;
  - with `coarse = false`, no IntersectionObserver is created;
  - cleanup removes the listeners, disconnects the observer and clears the timer.

  Dispatch events with `new Event('pointerenter')` plus `Object.defineProperty(e, 'pointerType', { value: 'mouse' })`; jsdom has no PointerEvent constructor.

  Run both → FAIL.

- [ ] **Step 3: Implement `power.ts`** (spec §7.1, verbatim) **and `intent.ts`:**

```ts
import type { IntentSource } from './power'

const DWELL_MS = 800
const DWELL_RATIO = 0.6

/**
 * Calls `onIntent` once, on the first sign the visitor means to use the monitor: a mouse or pen
 * entering the figure box (well before it reaches the screen, so the OS boots during the approach),
 * keyboard focus on the screen, a tap, or (touch devices, which have no hover) the box held mostly
 * in view for a moment. Returns the cleanup.
 */
export function watchIntent(box: HTMLElement, screen: HTMLElement, coarse: boolean, onIntent: (source: IntentSource) => void): () => void {
  let done = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let io: IntersectionObserver | null = null
  const fire = (source: IntentSource) => {
    if (done) return
    done = true
    cleanup()
    onIntent(source)
  }
  const onEnter = (e: Event) => {
    const type = (e as PointerEvent).pointerType
    if (type === 'mouse' || type === 'pen') fire('pointer')
  }
  const onDown = (e: Event) => {
    if ((e as PointerEvent).pointerType === 'touch') fire('tap')
  }
  const onFocus = () => fire('focus')
  box.addEventListener('pointerenter', onEnter)
  box.addEventListener('pointerdown', onDown)
  screen.addEventListener('focusin', onFocus)
  if (coarse) {
    io = new IntersectionObserver(
      (entries) => {
        const visible = (entries.at(-1)?.intersectionRatio ?? 0) >= DWELL_RATIO
        clearTimeout(timer)
        if (visible) timer = setTimeout(() => fire('dwell'), DWELL_MS)
      },
      { threshold: [0, DWELL_RATIO, 1] },
    )
    io.observe(box)
  }
  function cleanup() {
    box.removeEventListener('pointerenter', onEnter)
    box.removeEventListener('pointerdown', onDown)
    screen.removeEventListener('focusin', onFocus)
    io?.disconnect()
    clearTimeout(timer)
  }
  return cleanup
}
```

- [ ] **Step 4:** Run → PASS. **Commit:**

```bash
git add apps/web/features/desk/power.ts apps/web/features/desk/intent.ts apps/web/tests/unit/desk/power.test.ts apps/web/tests/unit/desk/intent.test.ts
```
```bash
git commit -m "feat(web): power state machine and intent watcher for the monitor"
```

### Task 2.2: The powered-off screen and `powerOn()`

**Files:** Modify `apps/web/features/desk/monitor-screen.ts`, `apps/web/features/desk/screen-events.ts`, `apps/web/features/desk/engine.ts`, `apps/web/tests/unit/desk/monitor-screen.test.ts`, `apps/web/tests/unit/desk/screen-events.test.ts`

- [ ] **Step 1: Failing tests.**
  - `monitor-screen.test.ts`: a new screen has **no iframe**, `element.tabIndex === 0`, `role="img"` and `aria-label="Desktop (powered off)"`. `powerOn()` appends exactly one iframe (`src` `/os`, `title` `Desktop`), and a second call returns the same iframe. On the iframe's `load`: `tabIndex === -1`, the label is gone, and if `document.activeElement === element` beforehand, `iframe.focus` was called (spy). `onLoaded` fires once.
  - `screen-events.test.ts`: `watchScreen(element, getIframe, onChange, onInput)`. A `pointerenter` on the **element** → `onChange(true)`; `pointerleave` → `false`; `focusin` with the pointer away → `true`; `focusout` → `false`. After an iframe appears (`getIframe` returns it) and fires `load`, `pointerdown` in its `contentWindow` calls `onInput` (as the existing tests do, adapted to the new signature).

- [ ] **Step 2: Implement.**
  - `MonitorScreen` gets `element: HTMLDivElement` (the slab), `iframe: HTMLIFrameElement | null` (a getter), `powerOn(): HTMLIFrameElement` and `onLoaded(cb)`.
  - `createScreenElement` no longer creates the iframe; it sets `element.tabIndex = 0`, `role`, `aria-label`.
  - `powerOn()` creates the iframe exactly as today (class `screen-jitter`, padding, `title`), inserts it before `fx`, and starts `gateOnDesktop(iframe, fx)` (moved from creation to power-on).
  - On `load` (`{ once: true }` for the handover; `gateOnDesktop` keeps its own listener for reloads), it hands the focus over:

```ts
      const hadFocus = document.activeElement === element
      element.tabIndex = -1
      element.removeAttribute('role')
      element.removeAttribute('aria-label')
      if (hadFocus) iframe.focus()
      loaded()
```

  - `watchScreen` listens to `pointerenter`/`pointerleave`/`focusin`/`focusout` on the element (the "keyboard focus" rule stays: `focusin` counts only when `!state.over`). It binds the inner window on each `load` of the iframe returned by `getIframe()`. Because the iframe appears later, `watchScreen` gets a `screen.onIframe(cb)` hook from `MonitorScreen` (called in `powerOn`) to attach the `load` listener.
  - `engine.ts`: `DeskEngine` replaces `iframe` with `screen: { element; iframe: HTMLIFrameElement | null; powerOn(): void; onIframe(cb); onLoaded(cb) }`.

- [ ] **Step 3:** Run the unit tests → PASS. `check-types` will fail in `DeskScene.tsx` until Task 2.3; do Task 2.3 before committing, or commit both together.

### Task 2.3: DeskScene and Figure own the power; full screen rebinds

**Files:** Modify `apps/web/features/desk/DeskScene.tsx`, `apps/web/features/figure/Figure.tsx`, `apps/web/lib/dom/use-fullscreen.ts`, `apps/web/tests/unit/desk/desk-scene-outcome.test.ts`, `apps/web/tests/unit/dom/use-fullscreen.test.ts`, `apps/web/tests/e2e/figure.spec.ts`, `apps/web/tests/e2e/visual/desk-parity.spec.ts`

- [ ] **Step 1: Failing tests.**
  - `desk-scene-outcome.test.ts`: the fake engine gains `screen: { element, iframe: null, powerOn: vi.fn(), onIframe: vi.fn(), onLoaded: vi.fn() }`. New cases: `powerOn` is **not** called at mount; rendering with `fullscreen: true` calls it; `onPower('booting')` is reported when it is called (and `'on'` when the engine's `onLoaded` callback runs).
  - `use-fullscreen.test.ts`: `useFullscreen(ref, rebind)` re-installs the iframe keydown listener when `rebind` changes while `on`, so an iframe added after entering full screen still exits on Escape.

- [ ] **Step 2: Implement.**
  - `DeskScene` props: `{ onFail, onReady, muted, fullscreen, onPower }`.
  - In the mount effect, after the engine exists, it runs: `const coarse = matchMedia('(hover: none)').matches`, `const box = host.parentElement!` (the figure box), and `const stop = watchIntent(box, engine.screen.element, coarse, (source) => dispatch({ type: 'intent', source }))`. It uses `useReducer(reducePower, 'off')`.
  - An effect on `power === 'booting'` calls `engine.screen.powerOn()` and `onPower('booting')`.
  - `engine.screen.onLoaded(() => dispatch({ type: 'loaded' }))`, and an effect on `power === 'on'` calls `onPower('on')`.
  - An effect on `fullscreen` dispatches `{ type: 'intent', source: 'fullscreen' }`.
  - `watchScreen(engine.screen.element, () => engine.screen.iframe, …)`.
  - `Figure`: `const [power, setPower] = useState<Power>('off')`, `useFullscreen(box, power)`, `<DeskScene … fullscreen={full.on} onPower={setPower} />`.
  - `use-fullscreen.ts`: signature `useFullscreen(ref, rebind?: unknown)`, with `rebind` added to the effect's deps.

- [ ] **Step 3: e2e updates.** In `figure.spec.ts` "the monitor shows the OS…":
  - Before scrolling: `await expect(scene.locator('iframe')).toHaveCount(0)` once `data-loaded` is true (the scene draws with the screen powered off).
  - Then `await page.locator('[data-anchor="figure-box"]').hover()`, and the existing assertions follow (iframe attached, `data-ready`, a playing video).
  - Add a test "keyboard reaches the OS through the powered-off screen": Tab until `[aria-label="Desktop (powered off)"]` is focused (use `page.keyboard.press('Tab')` in a loop, at most 20), then expect the iframe `title="Desktop"` to become `document.activeElement` within 20 s.
  - Add a touch test (`test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })`): scroll the figure fully into view, wait 1 s, and expect the iframe attached (dwell).

  In `desk-parity.spec.ts` `ready()`, the hover on the box already powers the screen on. No change, but confirm.

- [ ] **Step 4: Verify**
  - `bun run --cwd apps/web test` and `check-types` → pass
  - `$env:PORT='3100'; bun run --cwd apps/web test:e2e` → pass
  - `bun run test:parity` (production build) → pass
  - Real-browser check on localhost: with a fresh profile and returning-visitor state (`desk-muted`, `role` in storage), hover the desk and watch the dark tube show the BIOS lines, then the desktop and the static fading in; Tab to the screen and type into the OS; in full screen, Escape exits after the late iframe.

- [ ] **Step 5: Commit** (Tasks 2.2 and 2.3 together)

```bash
git add apps/web/features/desk apps/web/features/figure apps/web/lib/dom/use-fullscreen.ts apps/web/tests
```
```bash
git commit -m "perf(web): the monitor's OS powers on with intent instead of booting during load"
```

### Task 2.4: Tracking plan for the new boot timing

**Files:** Modify `docs/observability-tracking-plan.md`

- [ ] **Step 1:** In `#### os_boot`, Notes: add "Inside the desk monitor the iframe mounts on intent (a mouse entering the figure, focus on the screen, a tap, a touch visitor dwelling on the figure, or full screen), so the embedded `os_boot` starts then, not during the page load." Update the line references (`Desktop.tsx` is unchanged). In the verification table row for `experience_ready`, change "(and an embedded one from the monitor)" to "(and an embedded one after hovering the desk)".
- [ ] **Step 2: Commit**

```bash
git add docs/observability-tracking-plan.md
```
```bash
git commit -m "docs: embedded os_boot starts on intent"
```

### Task 2.5: posthog-js loads lazily, events queue until it does

**Files:** Modify `apps/web/lib/analytics/{events.ts,init.ts}`, `apps/web/features/analytics/Analytics.tsx`, `apps/web/tests/unit/analytics/{events.test.ts,init.test.ts,analytics-component.test.ts,twin-events.test.ts}` (any that mock `posthog-js` statically)

- [ ] **Step 1: Failing tests, `events.test.ts`:**
  - before `attach(client)`, `track('role_selected', { role: 'x' })` does not throw and nothing is captured. After `attach(fake)`, the queued event is captured in order with its properties.
  - the queue keeps at most 100 events (the oldest are dropped).
  - `trackOnExit` before attach captures nothing and queues nothing. After attach it calls `capture(…, { transport: 'sendBeacon', send_instantly: true })`.
  - `init.test.ts`: `initPostHog(config, embedded)` returns a promise. It `import()`s posthog-js once (mock the module with `vi.mock('posthog-js', …)` and count factory calls), calls `init` with today's options, `register({ embedded: true })` when embedded, then `attach`. A second call returns the same promise.

- [ ] **Step 2: Implement.** `events.ts` no longer imports posthog-js at runtime:

```ts
import type { PostHog } from 'posthog-js'

/** What `track` needs from posthog; set by `initPostHog` once the library has loaded. */
type Client = Pick<PostHog, 'capture'>

const QUEUE_MAX = 100
let client: Client | null = null
const queue: Array<[string, Record<string, unknown>]> = []

/** Hands the loaded client over and flushes, in order, what was tracked before it existed. */
export function attach(next: Client): void {
  client = next
  for (const [event, properties] of queue.splice(0)) next.capture(event, properties)
}

/** Sends one catalog event; before posthog has loaded it waits in a short queue (none of it leaves without a token). */
export const track: Track = (event, properties) => {
  if (typeof window === 'undefined') return
  if (client) client.capture(event, properties)
  else {
    queue.push([event, properties as Record<string, unknown>])
    if (queue.length > QUEUE_MAX) queue.shift()
  }
}

/** For the page hiding: only with the client loaded; a beacon that cannot be sent now never will be. */
export const trackOnExit: Track = (event, properties) => {
  client?.capture(event, properties, { transport: 'sendBeacon', send_instantly: true })
}
```

**No token means no `attach`, so the queue is never flushed and nothing is sent, as today.** Clear the queue when `Analytics` decides there is no token (export `discardQueue()` and call it in the effect's no-token branch), so memory does not hold events forever.

`init.ts`:

```ts
let started: Promise<void> | null = null

/** Loads posthog-js (its own chunk, off the critical path) and starts it once per document. */
export function initPostHog(config: ClientAnalyticsConfig, embedded: boolean): Promise<void> {
  started ??= import('posthog-js').then(({ default: posthog }) => {
    posthog.init(config.token, { /* today's options, unchanged */ })
    if (embedded) posthog.register({ embedded: true })
    attach(posthog)
  })
  return started
}
```

`Analytics.tsx` calls `void initPostHog(…)`. The delegated and section trackers install immediately and use `track`, which queues.

- [ ] **Step 3:** Run `bun run --cwd apps/web test` → PASS (fix the mocks in the other analytics tests to the new module shape).
- [ ] **Step 4:** `$env:POSTHOG_PROJECT_TOKEN='phc_test'` on the dev server (as `analytics.spec.ts` requires), then `$env:PORT='3100'; bunx playwright test tests/e2e/analytics.spec.ts` → pass (`$pageview`, `outbound_click`, `section_viewed`, `section_engaged`, `os_boot` ready).
- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/analytics apps/web/features/analytics apps/web/tests/unit/analytics
```
```bash
git commit -m "perf(web): posthog-js in its own chunk, events queue until it loads"
```

### Task 2.6: OS apps load when opened

**Files:** Create `apps/web/features/os/lazy-app.tsx`, `apps/web/tests/unit/os/lazy-app.test.ts`. Modify `apps/web/features/os/apps.ts`, `apps/web/features/os/Window.tsx`, `apps/web/tests/unit/os/apps.test.ts`

- [ ] **Step 1: Failing test** (jsdom): `lazyApp(() => Promise.resolve({ default: Stub }))` renders `Stub` inside a `Suspense` after the promise resolves. `displayName` is kept for the taskbar and devtools. The loader is called only on first render, not at definition.
- [ ] **Step 2: Implement**

```tsx
'use client'
import { lazy, type ComponentType } from 'react'
import type { OsAppProps } from './apps'

/** An app whose code loads with its first window: the Messenger alone brings eve and zod. */
export function lazyApp(load: () => Promise<{ default: ComponentType<OsAppProps> }>, name: string): ComponentType<OsAppProps> {
  const App = lazy(load)
  const Lazy = (props: OsAppProps) => <App {...props} />
  Lazy.displayName = name
  return Lazy
}
```

In `apps.ts`: `component: lazyApp(() => import('./apps/messenger/Messenger').then((m) => ({ default: m.Messenger })), 'Messenger')`, and the same for `Conversation` and `Credits`. For the DOS apps, `dosApp` moves its `DosPlayer` import behind `lazyApp(() => import('./apps/dos/DosPlayer').then(…))`. `Showcase` stays a static import. `Window.tsx` wraps `children` in `<Suspense fallback={<div className={styles.loading} />}>`, where `.loading { width: 100%; height: 100%; background: var(--os-face); }`.

- [ ] **Step 3: Verify**
  - `bun run --cwd apps/web test` → pass
  - `$env:PORT='3100'; bunx playwright test tests/e2e/os.spec.ts` → pass (Messenger, DOS apps and Credits all open; the twin mock conversation works)
  - `bunx next build`, then confirm the boot chunk no longer contains eve: `rg -l "useEveAgent" apps/web/.next/static/chunks` lists only a chunk that `/os`'s HTML does **not** reference in its `<script src>` (check with `curl -s http://localhost:3100/os`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/features/os apps/web/tests/unit/os
```
```bash
git commit -m "perf(web): OS apps load with their first window; the boot chunk drops eve and zod"
```

### Task 2.7: The letter as Server Components with client islands

**Files:** Create `apps/web/features/theme/LightSwitch.tsx`, `apps/web/features/role/RoleControl.tsx`. Modify `apps/web/features/portfolio/Portfolio.tsx`, `apps/web/features/role/RoleHeadline.tsx`.

- [ ] **Step 1: `LightSwitch.tsx`** (client): owns `useReducedMotion`, `switchRef`, `useBlowout` and `import '@/features/blowout/blowout.css'`, and renders `<WallSwitch ref={switchRef} disabled={blowout.isActive} onToggled={blowout.register} />`.
- [ ] **Step 2: Split the headline.** `RoleHeadline.tsx` becomes a **server** component:

```tsx
import { RoleControl } from './RoleControl'

/** Name over "<drum> tail"; only the drum, its picker and the live status line are client code. */
export function RoleHeadline({ name, tail, hint }: { name: string; tail: string; hint: string }) {
  return (
    <>
      <h1>
        <span className="who" data-anchor="name">{name}</span>
        <span className="what">
          <RoleControl hint={hint} />
          <span className="tail">{tail}</span>
        </span>
      </h1>
      <RoleControl.Status />
    </>
  )
}
```

`RoleControl.tsx` (`'use client'`) holds today's `open` state with `RolePicker` and `RoleDrum`, and exports `RoleStatus` (the `sr-only role="status"` paragraph reading `useRole()`). Use a named export `RoleStatus` rather than a static property: a client reference cannot carry statics across the server boundary.

- [ ] **Step 3: `Portfolio.tsx`** becomes a server component (remove `'use client'` and `useRef`/`useReducedMotion`/`useBlowout`):

```tsx
import type { Portfolio as PortfolioData } from '@/lib/cms/types'
import { Bio } from '@/features/bio/Bio'
import { CuriousOverlay } from '@/features/curious/CuriousOverlay'
import { CuriousProvider } from '@/features/curious/CuriousProvider'
import { Figure } from '@/features/figure/Figure'
import { RoleHeadline } from '@/features/role/RoleHeadline'
import { RoleProvider } from '@/features/role/RoleProvider'
import { ContactLinks } from '@/features/sections/ContactLinks'
import { EntryList } from '@/features/sections/EntryList'
import { FooterNav } from '@/features/sections/FooterNav'
import { LightSwitch } from '@/features/theme/LightSwitch'

/** The letter: static structure rendered on the server, client islands where role, curious, theme or the scene live. */
export function Portfolio({ data }: { data: PortfolioData }) {
  const { settings } = data
  // the role reducer sizes itself from the discipline count once: a different set needs a fresh provider
  const roleKey = data.disciplines.map((d) => d.slug).join('|')
  return (
    <RoleProvider key={roleKey} disciplines={data.disciplines} defaultSlug={data.defaultSlug}>
      <CuriousProvider>
        <main>
          <LightSwitch />
          <RoleHeadline name={data.profile.name} tail={data.profile.headlineTail} hint={settings.pickerHint} />
          <Bio />
          <Figure />
          <ContactLinks links={data.contactLinks} />
          <EntryList id="work" title={settings.sectionLabels.work} entries={data.work} />
          <EntryList id="projects" title={settings.sectionLabels.projects} entries={data.projects} />
          <EntryList id="content" title={settings.sectionLabels.content} entries={data.content} />
        </main>
        <FooterNav items={data.nav} name={data.profile.name} />
        <CuriousOverlay pageNotes={settings.pageNotes} />
      </CuriousProvider>
    </RoleProvider>
  )
}
```

Everything passed to client components must be serialisable. `disciplines`, `entries`, `pageNotes` and `links` are plain CMS data. If `check-types` or the build reports a function or class instance crossing the boundary, fix that in `lib/cms/mappers.ts`, not with a client wrapper.

- [ ] **Step 4: Verify**
  - `bunx next build` → succeeds with no "functions cannot be passed to Client Components" error
  - `$env:PORT='3100'; bun run --cwd apps/web test:e2e` → all pass (role, curious, blowout, theme, layout without JS, analytics)
  - `node scripts/perf/lighthouse.ts --serve --runs 3 --calibrate --out .perf/p2-rsc --compare .perf/phase1-calibrated/summary.json`. Expected: the framework chunk's `scripting` in `representative.bootup` drops (less to hydrate).

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/portfolio apps/web/features/theme/LightSwitch.tsx apps/web/features/role
```
```bash
git commit -m "perf(web): the letter renders on the server; only stateful pieces hydrate"
```

### Task 2.8: Bundle assertions

**Files:** Create `apps/web/scripts/perf/chunks.ts`. Modify `apps/web/package.json` (`perf:chunks`).

- [ ] **Step 1:** `chunks.ts` (node) starts the production server (reuse `lighthouse.ts`'s `--serve` helpers by moving `waitFor`/`stop` into `scripts/perf/server.ts`). It fetches `/` and `/os`, collects the `<script src>` chunk URLs each document references at load, reads those files from `.next/static/chunks`, and asserts:
  - `/`'s initial chunks contain none of `posthog-js` (marker `__POSTHOG_INSTANCES__` or `posthog.__loaded`; use a marker you confirmed with `rg` in a build), `WebGLRenderer` or `CSS3DRenderer`;
  - `/os`'s initial chunks contain no `useEveAgent` and no `ZodError`.

  It also prints a table of initial JS bytes (raw and gzip) per document. Exit 1 on any failed assertion.
- [ ] **Step 2:** Run `node scripts/perf/chunks.ts` after a build → exit 0. Add it to the Phase 2 checkpoint, and to CI after the build step (it needs no CMS: the assertions use HTML only if the CMS is reachable; in CI, run it in the Lighthouse job of Task 3.6 where the CMS is up).
- [ ] **Step 3: Commit**

```bash
git add apps/web/scripts/perf apps/web/package.json
```
```bash
git commit -m "chore(web): assert what the letter and the OS load up front"
```

### Task 2.9: Phase 2 checkpoint

- [ ] Same commands as Task 1.11 with `--out .perf/phase2-*` and `--compare` against Phase 1. Expected: desktop TBT down substantially (no second app booting during load, smaller hydration, no posthog at load), and no `/os` document in the load's network requests. `node scripts/perf/chunks.ts` passes, and `bun run test:parity` passes.
- [ ] After deploy: PSI on production (both form factors), recorded in the PR.

---

## Phase 3: the desk renders in a worker; budgets in CI

### Task 3.1: Extract the DOM-free GL scene and the main-thread host (behaviour unchanged)

**Files:** Create `apps/web/features/desk/gl/{desk-gl.ts,host.ts,main-host.ts}`, `apps/web/tests/unit/desk/main-host.test.ts`. Modify `apps/web/features/desk/{engine.ts,monitor-screen.ts}`.

- [ ] **Step 1: Define the host interface** in `gl/host.ts`:

```ts
export type HostKind = 'worker' | 'main'

export interface GlFrameCamera {
  /** camera.matrixWorld.elements */
  view: Float32Array
  /** camera.projectionMatrix.elements */
  projection: Float32Array
}

/** Where the desk's WebGL lives. The engine drives it the same way whichever it is. */
export interface GlHost {
  readonly kind: HostKind
  /** The element the engine stacks over the CSS3D layer. */
  readonly canvas: HTMLCanvasElement
  load(): Promise<void>
  resize(width: number, height: number, pixelRatio: number): void
  /**
   * Draw a frame for `camera`. `commit` runs when the frame is on the canvas, in the same task, so
   * the caller can apply the matching CSS3D transform there; `models` says the desk is in it.
   */
  render(camera: GlFrameCamera, commit: (models: boolean) => void): boolean
  dispose(): void
}
```

- [ ] **Step 2: `desk-gl.ts`**: move from `engine.ts` and `monitor-screen.ts` everything WebGL. The `WebGLRenderer` is created with `{ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' }` and `setClearColor(0, 0)`. Also move the GL `Scene`, the screen's GL group (occluder plus bezels, from `screenPlanes(SCREEN)`), `loadDesk`, and a `Camera` driven by matrices:

```ts
const camera = new PerspectiveCamera()
camera.matrixAutoUpdate = false
camera.matrixWorldAutoUpdate = false

function applyCamera({ view, projection }: GlFrameCamera) {
  camera.matrixWorld.fromArray(view)
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
  camera.projectionMatrix.fromArray(projection)
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
}
```

  It exposes `createDeskGl(canvas: HTMLCanvasElement | OffscreenCanvas, assets, format) → { load, resize(w, h, dpr) /* renderer.setPixelRatio; renderer.setSize(w, h, false) */, render(camera): boolean /* models present */, dispose }`. No `document` and no `window`: the only globals used are `fetch`, `createImageBitmap` and `WebAssembly`, which are all available in workers.

- [ ] **Step 3: `main-host.ts`**: `createMainHost(assets, format): GlHost` creates an `HTMLCanvasElement`. `render(camera, commit)` calls `deskGl.render(camera)` synchronously, then `commit(models)`. `kind: 'main'`. Throws if WebGL is unavailable, as the engine does today.

- [ ] **Step 4: `engine.ts`** keeps the rig, CSS3D, `PerspectiveCamera` (main) and the loop. `draw()` becomes:

```ts
  const draw = () => {
    camera.updateMatrixWorld()
    const frame = { view: Float32Array.from(camera.matrixWorld.elements), projection: Float32Array.from(camera.projectionMatrix.elements) }
    host.render(frame, (models) => {
      cssCamera.matrixWorld.fromArray(frame.view)
      cssCamera.projectionMatrix.fromArray(frame.projection)
      css.render(cssScene, cssCamera)
      if (!announced && models) {
        announced = true
        onFirstFrame?.()
      }
      onFrame?.(new Vector3().setFromMatrixPosition(cssCamera.matrixWorld).length())
    })
  }
```

  Here `cssCamera` is a second `PerspectiveCamera` with `matrixAutoUpdate = false`, driven by the committed matrices. Check that `CSS3DRenderer.render` reads `camera.projectionMatrix.elements[5]` and `matrixWorldInverse`; it calls `camera.matrixWorldInverse` (it updates it with `camera.updateMatrixWorld()` when `matrixWorldAutoUpdate`), so set `cssCamera.matrixWorldInverse.copy(cssCamera.matrixWorld).invert()` explicitly before `css.render`.

  `createDeskEngine({ host, … })` takes the `GlHost` (injected), and the engine appends `host.canvas` where it appended `gl.domElement`. `load()` calls `host.load()`.

- [ ] **Step 5: Tests.** `main-host.test.ts`: with `createDeskGl` mocked, `render` calls `commit` synchronously with the models flag. `desk-scene-outcome.test.ts` keeps passing (the engine is mocked there). Add `engine.test.ts`: with a fake host whose `render` stores `commit` and calls it later, the CSS3D render (spy on `CSS3DRenderer.prototype.render` via `vi.mock`) is not called until `commit` runs, and `onFirstFrame` fires on the first commit with `models: true`.

- [ ] **Step 6: Verify:** `test`, `check-types`, `test:parity` (production build). It must pass unchanged: this task is a pure refactor. **Commit:**

```bash
git add apps/web/features/desk apps/web/tests/unit/desk
```
```bash
git commit -m "refactor(web): the desk's WebGL behind a host interface, still on the main thread"
```

### Task 3.2: Worker protocol, frame ring and worker host

**Files:** Create `apps/web/features/desk/gl/{protocol.ts,frame-ring.ts,desk.worker.ts,worker-host.ts}`, `apps/web/tests/unit/desk/frame-ring.test.ts`, `apps/web/tests/unit/desk/worker-host.test.ts`

- [ ] **Step 1: `protocol.ts`**: the spec §8.2 types, verbatim, plus `DeskAssetUrls = { model: string; texture: string; drop?: readonly string[] }[]`. The main thread resolves the texture format, so the worker gets plain URLs.

- [ ] **Step 2: Frame ring, test first.** `frame-ring.ts` pairs an in-flight `render` id with its camera and commit callback, and caps how many are in flight.

```ts
import type { GlFrameCamera } from './host'

export interface Pending {
  camera: GlFrameCamera
  commit: (models: boolean) => void
}

/** At most `max` frames in flight; a full ring means "skip this frame, the loop stays dirty". */
export class FrameRing {
  private next = 1
  private pending = new Map<number, Pending>()
  constructor(private readonly max = 3) {}

  /** The id to send, or null when full. */
  push(entry: Pending): number | null {
    if (this.pending.size >= this.max) return null
    const id = this.next++
    this.pending.set(id, entry)
    return id
  }

  /** The frame `id` arrived: its entry, and every older one dropped (a newer frame supersedes them). */
  settle(id: number): Pending | null {
    const entry = this.pending.get(id) ?? null
    for (const key of this.pending.keys()) if (key <= id) this.pending.delete(key)
    return entry
  }

  get inFlight(): number {
    return this.pending.size
  }
}
```

Tests: ids increase; `push` returns null at 3 in flight; `settle(2)` returns entry 2 and also drops 1; `settle` of an unknown id returns null and drops older ones.

- [ ] **Step 3: `desk.worker.ts`**

```ts
/// <reference lib="webworker" />
import { createDeskGl, type DeskGl } from './desk-gl'
import type { FromWorker, ToWorker } from './protocol'

declare const self: DedicatedWorkerGlobalScope
let gl: DeskGl | null = null
let models = false
const post = (message: FromWorker, transfer: Transferable[] = []) => self.postMessage(message, transfer)

self.onmessage = async ({ data }: MessageEvent<ToWorker>) => {
  switch (data.type) {
    case 'init': {
      try {
        gl = createDeskGl(data.canvas, data.assets)
      } catch {
        post({ type: 'unsupported' })
        return
      }
      data.canvas.addEventListener('webglcontextlost', () => post({ type: 'failed', reason: 'context_lost' }))
      post({ type: 'ready' })
      gl.load().then(
        () => {
          models = true
          post({ type: 'loaded' })
        },
        () => post({ type: 'failed', reason: 'load_error' }),
      )
      return
    }
    case 'resize':
      gl?.resize(data.width, data.height, data.pixelRatio)
      return
    case 'render': {
      if (!gl) return
      gl.render({ view: data.view, projection: data.projection })
      const bitmap = gl.canvas.transferToImageBitmap()
      post({ type: 'frame', id: data.id, bitmap, models }, [bitmap])
      return
    }
    case 'dispose':
      gl?.dispose()
      gl = null
      self.close()
  }
}
```

`createDeskGl` with an OffscreenCanvas keeps a reference as `gl.canvas`. The renderer's `preserveDrawingBuffer` stays false: `transferToImageBitmap` takes the current frame.

- [ ] **Step 4: `worker-host.ts`**

```ts
import { FrameRing } from './frame-ring'
import type { GlHost } from './host'
import type { DeskAssetUrls, FromWorker, ToWorker } from './protocol'

/** Resolves with the host once the worker has a WebGL context; rejects (→ main host) if it cannot. */
export function createWorkerHost(assets: DeskAssetUrls, timeoutMs = 3000): Promise<GlHost> {
  const canvas = document.createElement('canvas')
  const view = canvas.getContext('bitmaprenderer', { alpha: true })
  if (!view) return Promise.reject(new Error('no bitmaprenderer'))
  const offscreen = new OffscreenCanvas(1, 1)
  const worker = new Worker(new URL('./desk.worker.ts', import.meta.url), { type: 'module', name: 'desk' })
  const ring = new FrameRing()
  const send = (m: ToWorker, transfer: Transferable[] = []) => worker.postMessage(m, transfer)
  let loaded: { resolve: () => void; reject: (e: Error) => void } | null = null
  const loadPromise = new Promise<void>((resolve, reject) => {
    loaded = { resolve, reject }
  })

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error('worker timeout')), timeoutMs)
    function fail(e: Error) {
      clearTimeout(timer)
      worker.terminate()
      reject(e)
    }
    worker.onerror = () => fail(new Error('worker error'))
    worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
      switch (data.type) {
        case 'unsupported':
          return fail(new Error('no WebGL in worker'))
        case 'ready':
          clearTimeout(timer)
          worker.onerror = null
          return resolve(host)
        case 'loaded':
          return loaded?.resolve()
        case 'failed':
          return loaded?.reject(new Error(data.reason))
        case 'frame': {
          const entry = ring.settle(data.id)
          // the bitmap and the CSS3D transform for the same camera land in this one task: one paint
          view.transferFromImageBitmap(data.bitmap)
          entry?.commit(data.models)
        }
      }
    }
    const host: GlHost = {
      kind: 'worker',
      canvas,
      load: () => loadPromise,
      resize(width, height, pixelRatio) {
        canvas.width = Math.round(width * pixelRatio)
        canvas.height = Math.round(height * pixelRatio)
        send({ type: 'resize', width, height, pixelRatio })
      },
      render(camera, commit) {
        const id = ring.push({ camera, commit })
        if (id === null) return false // three in flight: the engine stays dirty and asks again next frame
        send({ type: 'render', id, view: camera.view, projection: camera.projection })
        return true
      },
      dispose() {
        send({ type: 'dispose' })
        worker.terminate()
      },
    }
    send({ type: 'init', canvas: offscreen, assets }, [offscreen])
  })
}
```

The main thread resolves the texture format (`textureFormat()`) and passes plain URLs, so `init` carries no format. Remove `textureFormat` from the spec's `ToWorker.init` type when writing `protocol.ts`. `GlHost.render` returns `boolean`: true when the frame was sent or drawn (the main host always returns true), false when skipped. In `engine.ts`'s `frame()`, a false result keeps `dirty = true`, so the loop asks again on the next rAF.

- [ ] **Step 5: `worker-host.test.ts`** (jsdom; stub `Worker`, `OffscreenCanvas` and `HTMLCanvasElement.prototype.getContext('bitmaprenderer')`):
  - `ready` resolves the host; `unsupported`, a worker `error` and the 3 s timeout (fake timers) each reject and terminate the worker.
  - `render` posts `render` with increasing ids; a `frame` for id 1 calls `transferFromImageBitmap` **before** `commit(models)`, both in the same message dispatch.
  - a 4th `render` with 3 in flight posts nothing and returns false.
  - `loaded` resolves `load()`, and `failed: load_error` rejects it.

- [ ] **Step 6: Turbopack spike.** `bunx next build` and confirm that the worker chunk is emitted (`rg -l "transferToImageBitmap" apps/web/.next/static`) and that it loads in a real browser (Task 3.3). If Turbopack rejects `new Worker(new URL('./desk.worker.ts', import.meta.url), { type: 'module' })`, check `node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md` for worker support in 16.3.4 before changing the approach; do not fall back to a blob URL workaround.

- [ ] **Step 7: Commit**

```bash
git add apps/web/features/desk/gl apps/web/tests/unit/desk
```
```bash
git commit -m "feat(web): desk worker protocol, frame pairing ring and the worker host"
```

### Task 3.3: Host selection, fallback, and `host` in the experience events

**Files:** Modify `apps/web/features/desk/gl/host.ts` (`selectHost`), `apps/web/features/desk/DeskScene.tsx`, `apps/web/lib/analytics/{events.ts,experience.ts,use-experience.ts}`, `apps/web/features/figure/Figure.tsx`, `apps/web/tests/unit/analytics/{experience.test.ts,use-experience.test.ts}`, `apps/web/tests/unit/desk/select-host.test.ts`, `docs/observability-tracking-plan.md`

- [ ] **Step 1: Failing tests.**
  - `select-host.test.ts`: with `OffscreenCanvas` and `transferToImageBitmap` present, `selectHost` tries the worker host first. If that resolves, it returns `kind: 'worker'`. If it rejects, it returns the main host (`kind: 'main'`) without reporting a failure. Without `OffscreenCanvas`, it goes straight to the main host. A `?deskHost=main` query forces main (debug switch).
  - `experience.test.ts`: `ready({ host: 'worker' })` sends `experience_ready` with `host`, and `failed(reason, { host })` likewise.
- [ ] **Step 2: Implement.**
  - `AnalyticsEvents.experience_ready` gains `host?: 'worker' | 'main'`, and `experience_failed` the same. Its reason labels gain `context_lost`.
  - `ExperienceTimer.ready(extra?)` and `failed(reason, extra?)` merge `extra`.
  - `DeskScene`: `const host = await selectHost(urls)` inside the mount effect (it is async now: guard with `live`). Pass it to `createDeskEngine`. `onReady(host.kind)`, and `onFail(reason, host?.kind)`.
  - `Figure` passes those to `timing.ready({ host })` and `timing.failed(reason, { host })`.
  - `context_lost` collapses the figure as `load_error` does.
  - Tracking plan: `desk_scene` gains the `host` property and the `context_lost` failure. The insight suggestion now says "by `properties.host`".
- [ ] **Step 3: Verify**
  - `bun run --cwd apps/web test` and `check-types` → pass.
  - Real browser (Chrome) on localhost, production build: `performance` panel shows the long task in `0upzdq…`-equivalent main chunk is gone, and a `desk` worker thread does the WebGL work; the scene looks identical.
  - Real browser with `?deskHost=main`: identical.
  - If available, Safari 17+ and Firefox: worker host. Older Safari: main host. Note what was tested in the PR.
  - `bun run test:parity` → pass in both hosts. Run it twice, the second time with `PARITY_QUERY=deskHost=main`. Add support to the spec: `openPortfolio(page, process.env.PARITY_QUERY ? '/?' + process.env.PARITY_QUERY : '/')`.
- [ ] **Step 4: Commit**

```bash
git add apps/web/features/desk apps/web/features/figure apps/web/lib/analytics apps/web/tests docs/observability-tracking-plan.md apps/web/tests/e2e/visual
```
```bash
git commit -m "perf(web): the desk renders in a worker where supported, main thread otherwise"
```

### Task 3.4: Phase 3 checkpoint

- [ ] Same as Task 1.11 with `--out .perf/phase3-*`, compared against Phase 2. Expected: desktop TBT under 150 ms in the calibrated run, no long task attributed to the three chunk on the main thread, and `desk_scene` still reported (check in the dev server with a fake token, using the analytics e2e capture pattern: add a test in `analytics.spec.ts`, "the desk scene reports its host", that scrolls to the figure with models allowed and expects `experience_ready` with `experience: 'desk_scene'` and `host` matching `/worker|main/`).
- [ ] `bun run test:parity` passes (worker and main).
- [ ] After deploy, PSI on production (mobile and desktop) is recorded. Target: ≥ 90 both.

### Task 3.5: Lighthouse CI budgets

**Files:** Create `apps/web/lighthouserc.json`. Modify `.github/workflows/ci.yml`.

- [ ] **Step 1: `lighthouserc.json`**

```json
{
  "ci": {
    "collect": {
      "url": ["http://127.0.0.1:3100/"],
      "numberOfRuns": 3,
      "settings": { "chromeFlags": "--headless=new --no-sandbox" }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.8 }],
        "categories:accessibility": ["error", { "minScore": 1 }],
        "categories:best-practices": ["error", { "minScore": 1 }],
        "categories:seo": ["error", { "minScore": 1 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.02 }],
        "total-blocking-time": ["error", { "maxNumericValue": 300 }],
        "total-byte-weight": ["error", { "maxNumericValue": 1600000 }],
        "resource-summary:script:size": ["error", { "maxNumericValue": 460000 }]
      }
    },
    "upload": { "target": "filesystem", "outputDir": ".lighthouseci" }
  }
}
```

The CI floor for performance is 0.8: CI runners are slower and noisier than PSI. The 0.9 target is checked on production PSI at each phase checkpoint. CLS, bytes and the other categories are strict.

- [ ] **Step 2: CI job** `lighthouse` (`needs: checks`, every PR and push). Copy `live-evals`' throwaway-CMS steps (generate `PAYLOAD_SECRET`, `mkdir -p apps/payload/.tmp`, `bun run --cwd apps/payload build`, `seed`, start on 3001 with the health loop). The web build gets `CMS_URL=http://127.0.0.1:3001`, `SITE_URL=http://127.0.0.1:3100` and the same ci-secret env as `checks`' bundle step. Then:

```yaml
      - name: build and start web
        run: |
          bunx turbo run build --filter=web
          # standalone does not carry static files or public/: lay them out as the Dockerfile does
          cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
          cp -r apps/web/public apps/web/.next/standalone/apps/web/public
          PORT=3100 HOSTNAME=127.0.0.1 nohup node apps/web/.next/standalone/apps/web/server.js > "$RUNNER_TEMP/web.log" 2>&1 &
          for _ in $(seq 60); do curl -fsS http://127.0.0.1:3100/ > /dev/null && exit 0; sleep 2; done
          tail -n 100 "$RUNNER_TEMP/web.log"; exit 1
      - name: bundle assertions
        run: node apps/web/scripts/perf/chunks.ts --url http://127.0.0.1:3100
      - name: lighthouse (desktop and mobile)
        run: |
          bunx @lhci/cli@0.15.1 autorun --config=apps/web/lighthouserc.json --collect.settings.preset=desktop
          bunx @lhci/cli@0.15.1 autorun --config=apps/web/lighthouserc.json
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: lighthouse, path: .lighthouseci }
```

`chunks.ts` gets a `--url` option so it can skip its own `--serve`.

- [ ] **Step 3:** Push the branch and confirm the job passes. If the CI hardware misses TBT ≤ 300 ms with the final code, calibrate it from three CI runs (median + 25 %) and record the numbers in the PR; never relax CLS or the byte budget.
- [ ] **Step 4: Commit**

```bash
git add apps/web/lighthouserc.json .github/workflows/ci.yml apps/web/scripts/perf/chunks.ts
```
```bash
git commit -m "ci: Lighthouse budgets on every PR against a throwaway CMS"
```

### Task 3.6: PostHog web-vitals alerting guidance

**Files:** Modify `docs/observability.md`

- [ ] **Step 1:** Add a section "Performance alerts" with:
  - **Insights:** trends on `$web_vitals`, p75 of `$web_vitals_LCP_value`, `$web_vitals_INP_value` and `$web_vitals_CLS_value` (confirm the property names in Data management), broken down by `$device_type`, daily interval.
  - **Alerts:** LCP p75 > 2500 ms, INP p75 > 200 ms, CLS p75 > 0.1 for two consecutive days, email the owner.
  - A trend of p95 of `experience_ready.ms` where `experience = desk_scene`, by `host`, with an alert at > 4000 ms.
  - How to read a regression: check the Lighthouse CI artifact of the PR that preceded it.
- [ ] **Step 2: Commit**

```bash
git add docs/observability.md
```
```bash
git commit -m "docs: web-vitals and desk-scene alerts in PostHog"
```

The owner creates the insights and alerts in PostHog; this plan does not change PostHog configuration.

---

## Final verification (before the PR)

- [ ] `bun run --cwd apps/web test`, `bun run --cwd apps/web check-types`, `bunx turbo run check-types lint`
- [ ] `$env:PORT='3100'; bun run --cwd apps/web test:e2e` (dev server, CMS on 3201): all pass
- [ ] `bun run --cwd apps/web test:parity` (production build): all pass, worker and main
- [ ] `bun run --cwd apps/web assets:check`: exit 0
- [ ] `node scripts/perf/chunks.ts`: exit 0
- [ ] Real-browser check on localhost, fresh profile and returning visitor (role, muted and theme in storage): letter, theme switch and blowout, role picker and bio morph, curious mode, desk hover zoom, OS power-on and boot, CRT static, full screen and Escape, keyboard path into the OS, touch dwell (device emulation), reduced motion (no static video, no jitter)
- [ ] Lighthouse: final calibrated and devtools runs compared with the baseline, pasted in the PR; production PSI after deploy
