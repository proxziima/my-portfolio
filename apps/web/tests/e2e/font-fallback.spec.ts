import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, type Browser, type Page } from '@playwright/test'
import { openPortfolio, test } from './support'

/**
 * Inter is loaded with `font-display: optional` (spec §4.1): the face the letter first appears in is the face it keeps,
 * so loading the font can never move the text. What a reader sees, on every platform:
 *
 * - a normal load (Inter preloaded and served promptly) shows the letter in Inter from its first paint, with no shift;
 * - a load where Inter arrives after the block period stays in the matched fallback for the page's life: when the
 *   font lands, nothing swaps and nothing moves.
 *
 * Each test names the system face the text rendered in, so a runner that changes fonts says so.
 */
const MAX_CLS = 0.001
const SIZES = [
  { width: 1350, height: 940 },
  { width: 412, height: 823 },
] // the layout-shift recorder's sizes (scripts/perf/layout-shifts.ts)

/** Every system face the fallbacks were tuned for (or are metric clones of one): each `local()` name. */
const TUNED = new Set(
  [...readFileSync(fileURLToPath(new URL('../../styles/font-fallbacks.css', import.meta.url)), 'utf8').matchAll(/local\('([^']+)'\)/g)].map((m) => m[1]!),
)

interface Face {
  family: string
  glyphs: number
}

/**
 * The faces Chromium rendered the headline and the bio with (DevTools' "Rendered fonts"), by glyphs drawn, most first.
 * The first is the text face; the rest are per-character fallbacks (an emoji, a symbol) that the text face lacks.
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

interface Shift {
  t: number
  value: number
  hadRecentInput: boolean
}

/** A page at `size` that records every layout shift from the start of the load, the desk models held back. */
async function recordingPage(browser: Browser, size: { width: number; height: number }) {
  const context = await browser.newContext({ viewport: size })
  const page = await context.newPage()
  await page.route('**/*.glb', () => new Promise<void>(() => {}))
  await page.addInitScript(() => {
    const w = window as unknown as { __shifts: Shift[] }
    w.__shifts = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        w.__shifts.push({ t: e.startTime, value: e.value, hadRecentInput: e.hadRecentInput })
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  return { context, page }
}

/** The load's CLS so far (every shift without recent input; a load this short is one session window). */
const cls = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as { __shifts: Shift[] }).__shifts))
    .filter((s) => !s.hadRecentInput)
    .reduce((sum, s) => sum + s.value, 0)

const frames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

/** Inter's `@font-face` rules as the page has them: display and source URLs. */
const interFaces = (page: Page) =>
  page.evaluate(() =>
    [...document.styleSheets].flatMap((sheet) => {
      let rules: CSSRule[] = []
      try {
        rules = [...sheet.cssRules]
      } catch {
        return [] // a cross-origin sheet
      }
      return rules
        .filter((r): r is CSSFontFaceRule => r instanceof CSSFontFaceRule && /^['"]?Inter['"]?$/.test(r.style.getPropertyValue('font-family').trim()))
        .map((r) => ({
          display: r.style.getPropertyValue('font-display'),
          urls: [...r.style.getPropertyValue('src').matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => new URL(m[1]!, sheet.href ?? location.href).href),
        }))
    }),
  )

for (const size of SIZES) {
  test(`a normal load shows the letter in Inter from its first paint, with no shift, at ${size.width}×${size.height}`, async ({ browser }) => {
    test.setTimeout(60_000)
    const { context, page } = await recordingPage(browser, size)
    const documentResponse = page.waitForResponse((r) => r.request().resourceType() === 'document' && r.frame() === page.mainFrame())
    await openPortfolio(page)
    const faces = await interFaces(page)
    expect(faces.length, "the page has Inter's @font-face").toBeGreaterThan(0)
    for (const f of faces) expect(f.display, 'Inter is optional: the first face shown is the one kept').toBe('optional')
    // the preload is what puts Inter there before the first paint: next/font sends it as a Link header (or a <link>)
    const header = (await documentResponse).headers()['link'] ?? ''
    const preloads = [
      ...[...header.matchAll(/<([^>]+)>([^,]*)/g)].filter((m) => /rel="?preload/.test(m[2]!) && /as="?font/.test(m[2]!)).map((m) => new URL(m[1]!, page.url()).href),
      ...(await page.evaluate(() => [...document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="font"]')].map((l) => l.href))),
    ]
    expect(
      faces.some((f) => f.urls.some((u) => preloads.includes(u))),
      `Inter's woff2 is preloaded (preloads: ${preloads.join(', ') || 'none'})`,
    ).toBe(true)
    await page.evaluate(() => document.fonts.ready)
    await frames(page)
    // with `optional`, a face that missed the block period is never used afterwards: Inter now means Inter from the first paint
    const rendered = await renderedFaces(page)
    test.info().annotations.push({ type: 'rendered face', description: describeFaces(rendered) })
    expect(rendered[0]?.family, 'the letter is set in Inter').toBe('Inter')
    const value = await cls(page)
    test.info().annotations.push({ type: 'load CLS', description: value.toFixed(4) })
    await context.close()
    expect(value, 'layout shift during the load').toBeLessThanOrEqual(MAX_CLS)
  })

  test(`Inter arriving late leaves the letter in the matched fallback, with no shift, at ${size.width}×${size.height}`, async ({ browser }) => {
    test.setTimeout(60_000)
    const { context, page } = await recordingPage(browser, size)
    // the web fonts are held well past the block period, until the page has laid out and hydrated in the fallback
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/*.woff2', async (route) => {
      await released
      await route.continue()
    })
    // the load event waits for the preloaded fonts, which are held
    await openPortfolio(page, '/', 'domcontentloaded')
    await frames(page)
    await page.waitForTimeout(500)
    const before = await renderedFaces(page)
    const fallback = before[0]?.family ?? 'nothing'
    test.info().annotations.push({ type: 'fallback face', description: describeFaces(before) })
    // otherwise Inter could not arrive late and the test would pass for the wrong reason
    expect(await page.evaluate(() => document.fonts.status), 'the web fonts are still on their way').toBe('loading')
    // the rare view without Inter is the tuned one, not an untuned system face
    expect(TUNED.has(fallback), `the fallback resolved to ${fallback}, a face styles/font-fallbacks.css has a tuning for`).toBe(true)
    release()
    await page.evaluate(() => document.fonts.ready)
    await frames(page)
    await page.waitForTimeout(500)
    expect((await renderedFaces(page))[0]?.family, 'the letter keeps the face it was first shown in').toBe(fallback)
    const value = await cls(page)
    test.info().annotations.push({ type: 'load CLS', description: value.toFixed(4) })
    await context.close()
    expect(value, `layout shift during the load (fallback: ${fallback})`).toBeLessThanOrEqual(MAX_CLS)
  })
}
