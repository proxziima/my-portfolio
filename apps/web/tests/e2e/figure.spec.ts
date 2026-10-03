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
