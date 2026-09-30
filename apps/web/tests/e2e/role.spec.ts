import { expect } from '@playwright/test'
import { collectErrors, drum, openPortfolio, status, test } from './support'

test('the wheel over the open picker steps the role and never scrolls the page (Q1)', async ({ page }) => {
  await openPortfolio(page)
  // the page must be taller than the viewport, or "scrollY stays 0" proves nothing
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 200)).toBe(true)

  const listbox = page.getByRole('listbox')
  // hover can land before the wrapper's mouseenter handler is live: retry until the picker opens
  await expect(async () => {
    await drum(page).hover()
    await expect(listbox).toBeVisible({ timeout: 500 })
  }).toPass()
  await expect(status(page)).toHaveText('Software engineer selected')

  // onto the rows themselves: the wheel listener covers the whole wrapper, not just the drum
  const box = await listbox.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 4 })
  await expect(listbox).toBeVisible()

  // trusted wheel input through CDP
  await page.mouse.wheel(0, 120)
  await expect(status(page)).toHaveText('AI engineer selected')
  expect(await page.evaluate(() => scrollY)).toBe(0)

  await page.waitForTimeout(300) // past the step cooldown
  await page.mouse.wheel(0, 120)
  await expect(status(page)).toHaveText('Civil engineer selected')
  expect(await page.evaluate(() => scrollY)).toBe(0)

  await page.waitForTimeout(300)
  await page.mouse.wheel(0, -120)
  await expect(status(page)).toHaveText('AI engineer selected')
  await page.waitForTimeout(300)
  await page.mouse.wheel(0, -120)
  await expect(status(page)).toHaveText('Software engineer selected')
  expect(await page.evaluate(() => scrollY)).toBe(0)
})

test('the same wheel scrolls the page once the pointer is off the picker (control for Q1)', async ({ page }) => {
  await openPortfolio(page)
  await page.mouse.move(720, 700)
  await page.mouse.wheel(0, 300)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0)
  await expect(status(page)).toHaveText('Software engineer selected')
})

test('role changes produce no console errors (Q2)', async ({ page }) => {
  const errors = collectErrors(page)
  await openPortfolio(page)
  for (const [key, title] of [['2', 'AI engineer'], ['3', 'Civil engineer'], ['1', 'Software engineer']] as const) {
    await page.keyboard.press(key)
    await expect(status(page)).toHaveText(`${title} selected`)
  }
  await page.waitForTimeout(600) // let effects and the morph settle
  expect(errors()).toEqual([])
})

test('the drum label follows the role after a theme toggle (Q3)', async ({ page }) => {
  await openPortfolio(page, '/#ai')
  await expect(drum(page)).toHaveAccessibleName(/AI engineer/)
  await page.getByRole('button', { name: /Turn the lights/ }).click()
  await expect(page.getByRole('button', { name: /Turn the lights on/ })).toBeVisible()
  await expect(drum(page)).toHaveAccessibleName(/AI engineer/)
  await expect(status(page)).toHaveText('AI engineer selected')
})

test('a saved role renders without morphing on reload (Q4)', async ({ page }) => {
  // records any morph word (.w.in / .w.out) that ever exists, from the first parse of the document
  await page.addInitScript(() => {
    const w = window as unknown as { __morphSeen: number }
    w.__morphSeen = 0
    const look = () => {
      if (document.querySelector('.w.out, .w.in')) w.__morphSeen++
    }
    new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
  })
  await openPortfolio(page)
  await page.keyboard.press('2')
  await expect(status(page)).toHaveText('AI engineer selected')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('role'))).toBe('ai')
  // the morph of that change is over
  await expect.poll(() => page.locator('.w.out, .w.in').count()).toBe(0)

  await page.reload({ waitUntil: 'domcontentloaded' })
  // (the init script re-ran with the new document, so __morphSeen counts this load only)
  expect(await page.locator('.w.out, .w.in').count()).toBe(0)
  await expect(status(page)).toHaveText('AI engineer selected')
  await page.waitForTimeout(1200) // longer than a morph would take
  expect(await page.locator('.w.out, .w.in').count()).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { __morphSeen: number }).__morphSeen)).toBe(0)
})
