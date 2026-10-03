import { expect, type Page } from '@playwright/test'
import { collectErrors, test } from './support'

const showcase = (page: Page) => page.getByRole('dialog', { name: 'Showcase' })

/** `/os` boots on its own (the boot screen is a second or so); wait for the first window. */
async function openDesktop(page: Page): Promise<void> {
  await page.goto('/os')
  await expect(showcase(page)).toBeVisible({ timeout: 15_000 })
}

test('boots to a desktop with the Showcase window and its taskbar tab', async ({ page }) => {
  const errors = collectErrors(page)
  await openDesktop(page)
  await expect(page.getByRole('navigation', { name: 'Taskbar' }).getByRole('button', { name: 'Showcase' })).toHaveAttribute('aria-pressed', 'true')
  await expect(showcase(page).getByRole('heading', { level: 1 })).not.toBeEmpty()
  expect(errors()).toEqual([])
})

test('minimise hides the window and the tab restores it', async ({ page }) => {
  await openDesktop(page)
  await page.getByRole('button', { name: 'Minimise Showcase' }).click()
  await expect(showcase(page)).toBeHidden()
  await page.getByRole('navigation', { name: 'Taskbar' }).getByRole('button', { name: 'Showcase' }).click()
  await expect(showcase(page)).toBeVisible()
})

test('a shortcut opens Credits on top, and close removes it', async ({ page }) => {
  await openDesktop(page)
  await page.getByRole('button', { name: 'Credits' }).first().dblclick()
  const credits = page.getByRole('dialog', { name: 'Credits' })
  await expect(credits).toBeVisible()
  const z = async (name: string) => page.getByRole('dialog', { name }).evaluate((el) => Number(getComputedStyle(el).zIndex))
  expect(await z('Credits')).toBeGreaterThan(await z('Showcase'))

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
  await showcase(page).getByRole('button', { name: 'About' }).click()
  await expect(showcase(page).getByRole('heading', { name: 'About' })).toBeVisible()
  await showcase(page).getByRole('navigation', { name: 'Showcase' }).getByRole('button', { name: 'Contact' }).click()
  await expect(showcase(page).getByRole('heading', { name: 'Contact' })).toBeVisible()
})
