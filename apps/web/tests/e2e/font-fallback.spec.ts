import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, type Browser, type Page } from '@playwright/test'
import { drum, openPortfolio, test } from './support'

/**
 * The font swap, gated two ways (spec §4.1):
 *
 * - Where the fallback is a face with a committed tuning (`styles/font-fallbacks.css`), it must wrap
 *   every role's headline and bio exactly like Inter: same block heights, so nothing below moves.
 * - On any platform, tuned face or not, the swap itself must shift the layout by at most `MAX_CLS`,
 *   the owner-accepted residual of words moving inside equal-height paragraphs.
 *
 * Each test names the system face the fallback resolved to, so a runner that changes fonts says so.
 */
const MAX_CLS = 0.05

/** Every system face the fallbacks were tuned for (or are metric clones of one): each `local()` name. */
const TUNED = new Set(
  [...readFileSync(fileURLToPath(new URL('../../styles/font-fallbacks.css', import.meta.url)), 'utf8').matchAll(/local\('([^']+)'\)/g)].map((m) => m[1]!),
)

/** Heights of the blocks above the figure; a font swap must not change any of them. */
const blocks = (page: Page) =>
  page.evaluate(() => ({
    h1: Math.round(document.querySelector('h1')!.getBoundingClientRect().height),
    bio: [...document.querySelectorAll('[data-anchor="bio"] p')].map((p) => Math.round(p.getBoundingClientRect().height)),
  }))

interface Face {
  family: string
  glyphs: number
}

/**
 * The system faces Chromium rendered the headline and the bio with (DevTools' "Rendered fonts"), by glyphs
 * drawn, most first. The first is the text face; the rest are per-character fallbacks (an emoji, a symbol)
 * that the text face lacks, the same whichever face sets the text.
 */
async function renderedFaces(page: Page): Promise<Face[]> {
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
    // the text sits in the blocks' descendants (the drum, the bio's word spans): ask for every element under them
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'h1, h1 *, [data-anchor="bio"] p, [data-anchor="bio"] p *' })
    const glyphs = new Map<string, number>()
    for (const nodeId of nodeIds) {
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      for (const f of fonts) glyphs.set(f.familyName, (glyphs.get(f.familyName) ?? 0) + f.glyphCount)
    }
    return [...glyphs].map(([family, n]) => ({ family, glyphs: n })).sort((a, b) => b.glyphs - a.glyphs)
  } finally {
    await cdp.detach()
  }
}

const describeFaces = (faces: Face[]) => faces.map((f) => `${f.family} (${f.glyphs} glyphs)`).join(', ')

async function roleCount(page: Page): Promise<number> {
  await drum(page).click()
  const n = await page.getByRole('option').count()
  await page.keyboard.press('Escape')
  return Math.max(1, n)
}

async function measure(browser: Browser, width: number, blockFonts: boolean) {
  const context = await browser.newContext({ viewport: { width, height: 900 } })
  const page = await context.newPage()
  await page.route('**/*.glb', () => new Promise<void>(() => {}))
  if (blockFonts) await page.route('**/*.woff2', (r) => r.abort())
  await openPortfolio(page)
  await page.evaluate(() => document.fonts.ready)
  const faces = await renderedFaces(page)
  const n = await roleCount(page)
  const layouts = []
  for (let i = 1; i <= n; i++) {
    await page.keyboard.press(String(i))
    await page.waitForTimeout(700) // the word morph settles
    layouts.push(await blocks(page))
  }
  await context.close()
  return { faces, layouts }
}

// 412 and 1350 are the layout-shift recorder's sizes (scripts/perf/layout-shifts.ts)
for (const width of [390, 412, 768, 1350, 1440]) {
  test(`a tuned fallback face wraps like Inter at ${width}px, for every role`, async ({ browser }) => {
    test.setTimeout(120_000)
    const fallback = await measure(browser, width, true)
    const face = fallback.faces[0]?.family ?? 'nothing'
    test.info().annotations.push({ type: 'fallback face', description: describeFaces(fallback.faces) })
    // only a tuned face can be held to Inter's line breaks; the swap CLS tests below still bound any other
    test.skip(!TUNED.has(face), `the fallback resolved to ${face}, which styles/font-fallbacks.css has no tuning for`)
    const inter = await measure(browser, width, false)
    expect(fallback.layouts, `the fallback (${face}) wraps every block like Inter`).toEqual(inter.layouts)
  })
}

interface Shift {
  t: number
  value: number
  hadRecentInput: boolean
}

for (const { width, height } of [
  { width: 1350, height: 940 },
  { width: 412, height: 823 },
]) {
  test(`swapping the fallback for Inter shifts the layout by at most ${MAX_CLS} at ${width}×${height}`, async ({ browser }) => {
    test.setTimeout(60_000)
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()
    await page.route('**/*.glb', () => new Promise<void>(() => {}))
    // the web fonts are held until the page has laid out and hydrated in the fallback, then all arrive at once
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/*.woff2', async (route) => {
      await released
      await route.continue()
    })
    await page.addInitScript(() => {
      const w = window as unknown as { __shifts: Shift[] }
      w.__shifts = []
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
          w.__shifts.push({ t: e.startTime, value: e.value, hadRecentInput: e.hadRecentInput })
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
    // the load event waits for the preloaded fonts, which are held
    await openPortfolio(page, '/', 'domcontentloaded')
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    await page.waitForTimeout(500)
    const faces = await renderedFaces(page)
    test.info().annotations.push({ type: 'fallback face', description: describeFaces(faces) })
    // otherwise there is no swap to measure and the bound would pass for the wrong reason
    expect(await page.evaluate(() => document.fonts.status), 'the web fonts are still on their way').toBe('loading')
    const t0 = await page.evaluate(() => performance.now())
    release()
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    expect((await renderedFaces(page))[0]?.family, 'Inter took over').toBe('Inter')
    await page.waitForTimeout(500)
    const shifts = await page.evaluate(() => (window as unknown as { __shifts: Shift[] }).__shifts)
    const cls = shifts.filter((s) => s.t >= t0 && !s.hadRecentInput).reduce((sum, s) => sum + s.value, 0)
    test.info().annotations.push({ type: 'swap CLS', description: cls.toFixed(4) })
    await context.close()
    expect(cls, `layout shift from the font swap (fallback: ${faces[0]?.family})`).toBeLessThanOrEqual(MAX_CLS)
  })
}
