/**
 * Generates `styles/font-fallbacks.css`: one `@font-face` per platform system font (Segoe UI, Roboto,
 * Helvetica Neue, Arial), each scaled and re-metricked to wrap the site's text like Inter does, so
 * the swap to Inter moves nothing (spec §4.1). Run with node (Playwright launches hang under bun on
 * Windows), against a running site whose CMS has the seed content:
 *
 *   node scripts/fonts/fallbacks.ts [--url http://localhost:3100/]
 *
 * Inter's metrics come from the woff2 the page itself loads (the file next/font ships). Each system
 * font starts from Capsize's average-width ratio; the script then lays the real page out in
 * Chromium, at every width in WIDTHS and for every role, once in Inter and once in the fallback
 * with a candidate `correction` on top of that ratio, and keeps, from the widest range of
 * corrections that leave every headline and bio paragraph as tall as in Inter, the one that changes
 * the fewest line breaks (see `pickCorrection`). It prints what is left: blocks of another height,
 * blocks that break their words differently, and the worst line-width error. Faces
 * this machine lacks keep the correction the committed file recorded for them.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import arial from '@capsizecss/metrics/arial'
import helveticaNeue from '@capsizecss/metrics/helveticaNeue'
import roboto from '@capsizecss/metrics/roboto'
import segoeUI from '@capsizecss/metrics/segoeUI'
import { chromium, type Browser, type Page } from '@playwright/test'
import * as fontkit from 'fontkit'
import { fallbackFace, formatCorrections, overrides, parseCorrections, pickCorrection, xWidthAvg, type Metrics } from './fallbacks-core.ts'

const { values } = parseArgs({ options: { url: { type: 'string', default: 'http://localhost:3100/' } } })
const OUT = fileURLToPath(new URL('../../styles/font-fallbacks.css', import.meta.url))
/** The gate's widths plus the layout-shift recorder's (412, 1350) and a small phone: the column runs from 328 to 600 px. */
const WIDTHS = [360, 390, 412, 768, 1350, 1440]
/** The correction grid: ±5 % around the average-width ratio, in steps far below one pixel per line. */
const GRID = Array.from({ length: 401 }, (_, i) => 0.95 + i * 0.00025)

interface Face {
  key: string
  family: string
  metrics: Metrics & { familyName: string; fullName: string; postscriptName: string }
}

/** Order is the CSS stack's: the first family a platform has wins. */
const FACES: Face[] = [
  { key: 'segoeUI', family: 'Inter Fallback Segoe', metrics: segoeUI },
  { key: 'roboto', family: 'Inter Fallback Roboto', metrics: roboto },
  { key: 'helveticaNeue', family: 'Inter Fallback Helvetica', metrics: helveticaNeue },
  { key: 'arial', family: 'Inter Fallback Arial', metrics: arial },
]

const localNames = (m: Face['metrics']) => [...new Set([m.familyName, m.fullName, m.postscriptName])]

/** One layout of the page: block heights (what the gate compares) and the width of every unbreakable run, with its line. */
interface Layout {
  heights: number[]
  /** Each block's content width: the room a line has. */
  widths: number[]
  runs: Array<{ block: number; top: number; width: number }>
  space: number
}

async function open(browser: Browser, width: number, blockFonts: boolean): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height: 900 } })
  const page = await context.newPage()
  await page.route('**/*.glb', () => new Promise<void>(() => {}))
  if (blockFonts) await page.route('**/*.woff2', (r) => r.abort())
  await page.goto(values.url!)
  // the role keys only work once React has hydrated the drum
  await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-haspopup="listbox"]')
    return !!button && Object.keys(button).some((key) => key.startsWith('__reactProps$'))
  })
  await page.evaluate(() => document.fonts.ready)
  return page
}

const roleCount = (page: Page) => page.locator('[role="option"]').count()

async function selectRole(page: Page, i: number) {
  await page.keyboard.press(String(i))
  await page.waitForTimeout(700) // the word morph settles
}

const layout = (page: Page): Promise<Layout> =>
  page.evaluate(() => {
    const h1 = document.querySelector('h1')!
    const ps = [...document.querySelectorAll('[data-anchor="bio"] p')]
    const runs: Layout['runs'] = []
    // the headline's parts never break inside (the tail is `pre`, the name fits); the bio breaks only between word spans
    for (const el of h1.querySelectorAll('.who, .tail, button[aria-haspopup] > [aria-hidden]:first-child')) {
      const range = document.createRange()
      range.selectNodeContents(el)
      const r = range.getBoundingClientRect()
      runs.push({ block: 0, top: Math.round(r.top), width: r.width })
    }
    ps.forEach((p, i) => {
      for (const w of p.querySelectorAll('.w')) {
        const r = w.getBoundingClientRect()
        runs.push({ block: i + 1, top: Math.round(r.top), width: r.width })
      }
    })
    const probe = (text: string) => {
      const s = document.createElement('span')
      s.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
      s.textContent = text
      ;(ps[0] ?? document.body).append(s)
      const w = s.getBoundingClientRect().width
      s.remove()
      return w
    }
    return {
      heights: [h1, ...ps].map((el) => Math.round(el.getBoundingClientRect().height)),
      widths: [h1, ...ps].map((el) => el.clientWidth),
      runs,
      space: probe('x x') - probe('xx'),
    }
  })

/** Forces the page onto `local` with these overrides, under a fresh family name so no cached face is reused. */
async function applyFallback(page: Page, local: string[], o: ReturnType<typeof overrides>, tag: string): Promise<boolean> {
  return page.evaluate(
    async ({ local, o, tag }) => {
      const family = `Probe ${tag}`
      // TS's DOM lib predates size-adjust in FontFaceDescriptors; Chromium supports it
      const descriptors = {
        sizeAdjust: `${o.sizeAdjust * 100}%`,
        ascentOverride: `${o.ascentOverride * 100}%`,
        descentOverride: `${o.descentOverride * 100}%`,
        lineGapOverride: `${o.lineGapOverride * 100}%`,
      }
      const face = new FontFace(family, local.map((n) => `local('${n}')`).join(', '), descriptors)
      try {
        await face.load()
      } catch {
        return false
      }
      const w = window as unknown as { __probe?: FontFace }
      if (w.__probe) document.fonts.delete(w.__probe)
      w.__probe = face
      document.fonts.add(face)
      document.body.style.fontFamily = `'${family}'`
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return true
    },
    { local, o, tag },
  )
}

/**
 * Worst width error over Inter's own lines (each line's runs plus the spaces between them, in both faces), as a
 * fraction of the room the line has: what decides whether the fallback breaks the line at the same word.
 */
function lineError(inter: Layout, fallback: Layout): { error: number; line: string } {
  const lines = new Map<string, { inter: number; fallback: number; room: number }>()
  inter.runs.forEach((run, i) => {
    const key = `${run.block === 0 ? 'h1' : `bio p${run.block}`} line at y=${run.top}`
    const line = lines.get(key) ?? { inter: -inter.space, fallback: -fallback.space, room: inter.widths[run.block]! }
    line.inter += run.width + inter.space
    line.fallback += fallback.runs[i]!.width + fallback.space
    lines.set(key, line)
  })
  let worst = { error: 0, line: '' }
  for (const [key, l] of lines) {
    const error = Math.abs(l.fallback - l.inter) / l.room
    if (error > worst.error) worst = { error, line: `${key} (${l.fallback.toFixed(1)} vs Inter ${l.inter.toFixed(1)} px of ${l.room})` }
  }
  return worst
}

async function interMetrics(page: Page): Promise<Metrics> {
  const urls = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((n) => n.endsWith('.woff2')),
  )
  let best: { font: fontkit.Font; size: number } | undefined
  for (const url of urls) {
    const body = await page.request.get(url).then((r) => r.body())
    const font = fontkit.create(body) as fontkit.Font
    if (font.familyName === 'Inter' && (!best || body.length > best.size)) best = { font, size: body.length }
  }
  if (!best) throw new Error(`no Inter woff2 among ${urls.join(', ') || 'the page requests'}`)
  const { font } = best
  return {
    ascent: font.ascent,
    descent: font.descent,
    lineGap: font.lineGap,
    unitsPerEm: font.unitsPerEm,
    xWidthAvg: xWidthAvg((char) => font.glyphsForString(char)[0]!.advanceWidth),
  }
}

interface Score {
  mismatches: number
  breaks: number
  error: number
  worst: string
  cases: string[]
}

const previous = existsSync(OUT) ? parseCorrections(readFileSync(OUT, 'utf8')) : {}
const browser = await chromium.launch({ headless: true })
try {
  const first = await open(browser, 1440, false)
  const inter = await interMetrics(first)
  const roles = Math.max(1, await roleCount(first))
  await first.context().close()
  console.log(`Inter: ${JSON.stringify(inter)}; ${roles} roles`)

  const scores = new Map<string, Score[]>(FACES.map((f) => [f.key, GRID.map(() => ({ mismatches: 0, breaks: 0, error: 0, worst: '', cases: [] }))]))
  const installed = new Set<string>()
  for (const width of WIDTHS) {
    const interPage = await open(browser, width, false)
    const probePage = await open(browser, width, true)
    for (let role = 1; role <= roles; role++) {
      await selectRole(interPage, role)
      await selectRole(probePage, role)
      const want = await layout(interPage)
      for (const face of FACES) {
        const local = localNames(face.metrics)
        for (const [i, c] of GRID.entries()) {
          if (!(await applyFallback(probePage, local, overrides(inter, face.metrics, c), `${face.key}${i}`))) break
          installed.add(face.key)
          const got = await layout(probePage)
          if (got.runs.length !== want.runs.length) throw new Error(`run count differs at ${width}px role ${role}`)
          const score = scores.get(face.key)![i]!
          got.heights.forEach((h, b) => {
            if (h === want.heights[b]) return
            score.mismatches++
            const lines = (px: number) => (b === 0 ? `${px} px` : `${px} px (${Math.round(px / 24)} lines)`)
            score.cases.push(`${width}px role ${role} ${b === 0 ? 'h1' : `bio p${b}`}: ${lines(h)} vs Inter ${lines(want.heights[b]!)}`)
          })
          // the same height can still hide a word that moved to the next line: that moves text, and counts as a shift
          const moved = new Set<number>()
          got.runs.forEach((run, i) => {
            const above = got.heights.slice(0, run.block + 1).every((h, j) => h === want.heights[j])
            if (above && run.top !== want.runs[i]!.top) moved.add(run.block)
          })
          for (const b of moved) {
            score.breaks++
            score.cases.push(`${width}px role ${role} ${b === 0 ? 'h1' : `bio p${b}`}: same height, different line breaks`)
          }
          const { error, line } = lineError(want, got)
          if (error > score.error) Object.assign(score, { error, worst: `${width}px role ${role} ${line}` })
        }
      }
    }
    await interPage.context().close()
    await probePage.context().close()
  }

  const corrections: Record<string, number> = {}
  for (const face of FACES) {
    if (!installed.has(face.key)) {
      corrections[face.key] = previous[face.key] ?? 1
      console.log(`${face.metrics.familyName}: not installed here, keeping correction ${corrections[face.key]!.toFixed(4)}`)
      continue
    }
    const all = scores.get(face.key)!
    const { index, window } = pickCorrection(all)
    corrections[face.key] = GRID[index]!
    const s = all[index]!
    console.log(
      `${face.metrics.familyName}: correction ${GRID[index]!.toFixed(4)}, worst line error ${(s.error * 100).toFixed(2)} % (${s.worst}), ${s.mismatches} height mismatches, ${s.breaks} blocks with other line breaks` +
        (window ? `; every height matches for ${GRID[window[0]]!.toFixed(4)}…${GRID[window[1]]!.toFixed(4)}` : '; no correction matches every height'),
    )
    for (const line of s.cases) console.log(`  ${line}`)
  }

  const css = [
    '/* Generated by scripts/fonts/fallbacks.ts (`bun run fonts:fallbacks`): do not edit by hand. */',
    '/* Per-platform fallbacks for Inter: each system font scaled and re-metricked to wrap the site text like Inter (spec §4.1). */',
    formatCorrections(corrections),
    '',
    FACES.map((f) => fallbackFace(f.family, localNames(f.metrics), overrides(inter, f.metrics, corrections[f.key]!))).join('\n\n'),
    '',
  ].join('\n')
  writeFileSync(OUT, css)
  console.log(`wrote ${OUT}`)
} finally {
  await browser.close()
}
