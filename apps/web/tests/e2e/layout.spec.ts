import { expect } from '@playwright/test'
import { openPortfolio, test } from './support'

test.describe('mobile', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('nothing scrolls sideways and the switch is fixed to the screen', async ({ page }) => {
    await openPortfolio(page)
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(widths.scroll).toBe(widths.client)
    await expect(page.locator('[data-anchor="switch"]')).toHaveCSS('position', 'fixed')
  })
})

test.describe('without javascript', () => {
  test.use({ javaScriptEnabled: false })

  test('the letter still reads and the switch falls back to its images', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('backend plumber')).toBeVisible()
    const images = page.locator('[data-anchor="switch"] img')
    await expect(images).toHaveCount(2)
    await expect(images.first()).toHaveAttribute('src', /rocker-on\.webp/)
    await expect(images.nth(1)).toHaveAttribute('src', /rocker-off\.webp/)
    // the light frame is the one showing
    await expect(images.first()).toBeVisible()
  })
})

// `test` holds the scene back by default; these tests route it themselves (the later route wins)
test.describe('the figure', () => {
  test('keeps a 3:2 box and its caption while the scene is slow', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    // the 4.5 MB scene never arrives
    await page.route('**/*.splinecode', () => new Promise<void>(() => {}))
    await openPortfolio(page)

    const box = page.locator('[data-anchor="figure-box"]')
    await expect(box).toBeAttached()
    const size = await box.evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }))
    expect(size.h).toBeGreaterThan(0)
    expect(size.w / size.h).toBeCloseTo(1.5, 1)
    const caption = page.locator('figure[data-anchor="figure"] figcaption')
    await expect(caption).not.toBeEmpty()
    await expect(caption).toBeVisible()
    expect(errors).toEqual([])
  })

  test('collapses to the caption when the scene fails', async ({ page }) => {
    await page.route('**/*.splinecode', (route) => route.abort())
    await openPortfolio(page)
    await page.locator('[data-anchor="figure"]').scrollIntoViewIfNeeded()
    await expect(page.locator('[data-anchor="figure-box"]')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.locator('figure[data-anchor="figure"] figcaption')).toBeVisible()
  })
})
