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

// 412 and 1350 are the layout-shift recorder's sizes (scripts/perf/layout-shifts.ts)
for (const width of [390, 412, 768, 1350, 1440]) {
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
