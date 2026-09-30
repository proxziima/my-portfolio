import { expect } from '@playwright/test'
import { openPortfolio, test } from './support'

test('the theme persists across a reload with no flash', async ({ page }) => {
  // the attribute must be on <html> by DOMContentLoaded (the inline ThemeScript), before React paints anything
  await page.addInitScript(() => {
    const w = window as unknown as { __themeAtDcl: string | null }
    w.__themeAtDcl = 'unset'
    document.addEventListener('DOMContentLoaded', () => {
      w.__themeAtDcl = document.documentElement.getAttribute('data-theme')
    })
  })
  await openPortfolio(page)
  await page.getByRole('button', { name: 'Turn the lights off' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __themeAtDcl: string | null }).__themeAtDcl))
    .toBe('dark')
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  await expect(page.getByRole('button', { name: 'Turn the lights on' })).toBeVisible()
})
