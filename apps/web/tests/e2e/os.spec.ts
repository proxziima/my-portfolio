import { expect, type Page } from '@playwright/test'
import { collectErrors, test } from './support'

// titled like the reference's window: "<owner> - Showcase <year>"
const SHOWCASE = /^.+ - Showcase \d{4}$/
const showcase = (page: Page) => page.getByRole('dialog', { name: SHOWCASE })

/** `/os` boots on its own (the boot screen is a second or so); wait for the first window. */
async function openDesktop(page: Page): Promise<void> {
  await page.goto('/os')
  await expect(showcase(page)).toBeVisible({ timeout: 15_000 })
}

test('boots to a desktop with the Showcase window and its taskbar tab', async ({ page }) => {
  const errors = collectErrors(page)
  await openDesktop(page)
  await expect(page.getByRole('navigation', { name: 'Taskbar' }).getByRole('button', { name: SHOWCASE })).toHaveAttribute('aria-pressed', 'true')
  await expect(showcase(page).getByRole('heading', { level: 1 })).not.toBeEmpty()
  expect(errors()).toEqual([])
})

test('minimise hides the window and the tab restores it', async ({ page }) => {
  await openDesktop(page)
  await showcase(page).getByRole('button', { name: /^Minimise / }).click()
  await expect(showcase(page)).toBeHidden()
  await page.getByRole('navigation', { name: 'Taskbar' }).getByRole('button', { name: SHOWCASE }).click()
  await expect(showcase(page)).toBeVisible()
})

test('a shortcut opens Credits on top, and close removes it', async ({ page }) => {
  await openDesktop(page)
  await page.getByRole('button', { name: 'Credits' }).first().dblclick()
  const credits = page.getByRole('dialog', { name: 'Credits' })
  await expect(credits).toBeVisible()
  const z = async (name: string | RegExp) => page.getByRole('dialog', { name }).evaluate((el) => Number(getComputedStyle(el).zIndex))
  expect(await z('Credits')).toBeGreaterThan(await z(SHOWCASE))

  // the roll: the owner's section first, a click moves on, a dot ticks in every second
  const status = await credits.locator('footer span').first().textContent()
  const name = status?.match(/^© Copyright \d{4} (.+)$/)?.[1]
  expect(name).toBeTruthy()
  await expect(credits.getByRole('heading', { level: 2, name: 'Credits' })).toBeVisible()
  await expect(credits.getByRole('heading', { level: 3, name: 'Engineering & Design' })).toBeVisible()
  await expect(credits.getByText(name!, { exact: true })).toBeVisible()
  await credits.getByRole('heading', { level: 2, name: 'Credits' }).click()
  await expect(credits.getByRole('heading', { level: 3, name: 'Modeling & Texturing' })).toBeVisible()
  await page.waitForTimeout(1200)
  await expect(credits.locator('[data-anchor="credits-dots"] > span').first()).toBeAttached()

  await page.getByRole('button', { name: 'Close Credits' }).click()
  await expect(credits).toHaveCount(0)
})

test('the Doom shortcut boots the shareware bundle in js-dos', async ({ page }) => {
  // DOSBox runs as WASM and the frames are drawn in software in headless Chromium: allow it time
  test.setTimeout(60_000)
  await openDesktop(page)
  await page.getByRole('button', { name: 'Doom', exact: true }).dblclick()
  const doom = page.getByRole('dialog', { name: 'Doom' })
  await expect(doom).toBeVisible()
  await expect(doom.locator('footer span').first()).toHaveText('Powered by JSDOS & DOSBox')
  await expect(page.locator('head script[src="/js-dos/js-dos.js"]')).toHaveCount(1)
  await expect(doom.locator('[data-anchor="dos-player"] canvas').first()).toBeAttached({ timeout: 30_000 })
})

test('dragging the title bar moves the window', async ({ page }) => {
  await openDesktop(page)
  const title = showcase(page).locator('header')
  const before = await showcase(page).boundingBox()
  const bar = await title.boundingBox()
  if (!before || !bar) throw new Error('window not laid out')
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2)
  await page.mouse.down()
  await page.mouse.move(bar.x + bar.width / 2 + 120, bar.y + bar.height / 2 + 60, { steps: 8 })
  await page.mouse.up()
  const after = await showcase(page).boundingBox()
  expect(after?.x).toBeCloseTo(before.x + 120, 0)
  expect(after?.y).toBeCloseTo(before.y + 60, 0)
})

test('the Showcase navigates between pages', async ({ page }) => {
  await openDesktop(page)
  // the window carries the owner's name, as the Credits roll's status line does
  const status = await showcase(page).locator('footer span').first().textContent()
  const name = status?.match(/^© Copyright (\d{4}) (.+)$/)
  expect(name).toBeTruthy()
  await expect(showcase(page)).toHaveAccessibleName(`${name![2]} - Showcase ${name![1]}`)

  await showcase(page).getByRole('button', { name: 'About' }).click()
  await expect(showcase(page).getByRole('heading', { level: 1, name: 'Welcome' })).toBeVisible()
  const nav = showcase(page).getByRole('navigation', { name: 'Showcase' })
  await expect(nav.getByRole('button', { name: 'About' })).toHaveAttribute('aria-current', 'page')
  await nav.getByRole('button', { name: 'Contact' }).click()
  await expect(showcase(page).getByRole('heading', { level: 1, name: 'Contact', exact: true })).toBeVisible()
})

test('the Showcase lists projects as raised boxes, and those with a link open it in a new tab', async ({ page }) => {
  await openDesktop(page)
  await showcase(page).getByRole('button', { name: 'Projects' }).click()
  const content = showcase(page).locator('.content')
  await expect(content.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(content.locator('.bigButton').first()).toBeVisible()
  // the seed's projects carry no url yet: a box is a link only when its row has one
  for (const link of await content.locator('a.bigButton').all()) {
    await expect(link).toHaveAttribute('target', '_blank')
  }
})
