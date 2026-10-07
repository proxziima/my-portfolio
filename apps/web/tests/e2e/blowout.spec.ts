import { expect, type Page } from '@playwright/test'
import { openPortfolio, test } from './support'

const blowoutLeftovers = (page: Page) =>
  page.evaluate(
    () => [...document.querySelectorAll('*')].filter((el) => [...el.classList].some((c) => c.startsWith('bo-'))).length,
  )

test('ten fast clicks blow the bulb, then everything is cleaned up and the theme is restored', async ({ page }) => {
  await openPortfolio(page)
  const html = page.locator('html')
  const toggle = page.locator('[data-anchor="switch"] button')
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))

  // no delay between clicks: the 10th inside the 4s window starts the sequence. Real mouse clicks at the
  // switch's centre, resolved once: locator.click() re-checks actionability before every click, which on
  // a loaded CI runner (software WebGL) spread the ten clicks over 6s and never blew the bulb.
  const box = await toggle.boundingBox()
  if (!box) throw new Error('the wall switch has no box')
  for (let i = 0; i < 10; i++) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  await expect(html).toHaveAttribute('data-blackout', '')
  await expect(page.locator('.bo-fall')).toHaveCount(1)
  await expect(html).toHaveAttribute('data-theme', 'dark')

  // ~4.8s of choreography, then nothing of it is left
  await expect(html).not.toHaveAttribute('data-blackout', '', { timeout: 6000 })
  await expect.poll(() => blowoutLeftovers(page), { timeout: 6000 }).toBe(0)

  // ten toggles from the same starting point end where the tenth left the theme, and the blackout puts that back
  const expected = before === 'dark' ? 'dark' : 'light'
  await expect(html).toHaveAttribute('data-theme', expected)
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(expected)
  await expect(page.locator('[data-anchor="switch"]')).toHaveCSS('pointer-events', 'auto')
})
