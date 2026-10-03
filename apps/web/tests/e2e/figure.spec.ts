import { expect } from '@playwright/test'
import { openPortfolio, test } from './support'

// the models are allowed through: software WebGL is slow in headless Chromium, but one frame is enough
test('the monitor shows the OS and the scene draws a first frame', async ({ page }) => {
  await page.route('**/*.glb', (route) => route.continue())
  await openPortfolio(page)
  await page.locator('[data-anchor="figure"]').scrollIntoViewIfNeeded()
  const scene = page.locator('[data-anchor="desk-scene"]')
  await expect(scene.locator('iframe[title="Desktop"]')).toBeAttached({ timeout: 20_000 })
  await expect(scene).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 })
  await expect(scene.locator('canvas')).toHaveCount(1)
})

test('full screen covers the viewport and Escape restores the box', async ({ page }) => {
  await openPortfolio(page)
  const figure = page.locator('[data-anchor="figure"]')
  await figure.scrollIntoViewIfNeeded()
  const box = page.locator('[data-anchor="figure-box"]')
  await figure.getByRole('button', { name: 'Full screen' }).click()
  await expect(box).toHaveAttribute('data-full', 'true')
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('no viewport')
  await expect.poll(async () => (await box.boundingBox())?.width).toBe(viewport.width)
  await expect.poll(async () => (await box.boundingBox())?.height).toBe(viewport.height)
  await expect(box.getByRole('button', { name: 'Exit full screen' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-fullscreen', 'true')
  await page.keyboard.press('Escape')
  await expect(box).toHaveAttribute('data-full', 'false')
  await expect.poll(async () => {
    const r = await box.boundingBox()
    return r ? Math.round((r.width / r.height) * 10) / 10 : 0
  }).toBe(1.5)
  await expect(page.locator('html')).not.toHaveAttribute('data-fullscreen', 'true')
})
