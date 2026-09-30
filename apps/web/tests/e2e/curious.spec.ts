import { expect } from '@playwright/test'
import { drum, openPortfolio, test } from './support'

test('curious mode draws the guides, role formulas, and a role note that points at the drum', async ({ page }) => {
  await openPortfolio(page)
  await page.getByRole('switch', { name: 'Curious mode' }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-curious', '')
  await expect(page.getByText('600px').first()).toBeVisible()

  await page.keyboard.press('2')
  await expect(page.getByText('ℒ = −∑ yᵢ log ŷᵢ')).toBeVisible()

  // The role note hangs from the drum: its leader (13px down its first line) aims at the drum's centre,
  // and the note sits just left of the text column.
  const note = page.locator('[data-side="left"]', { hasText: 'Hover the role' })
  await expect(note).toBeVisible()
  await page.evaluate(() => scrollTo(0, 0))
  const [noteBox, drumBox] = await Promise.all([note.boundingBox(), drum(page).boundingBox()])
  expect(noteBox).not.toBeNull()
  expect(drumBox).not.toBeNull()
  const leaderY = noteBox!.y + 13
  const drumCentreY = drumBox!.y + drumBox!.height / 2
  expect(Math.abs(leaderY - drumCentreY)).toBeLessThan(12)
  expect(noteBox!.x + noteBox!.width).toBeLessThanOrEqual(drumBox!.x)
  expect(drumBox!.x - (noteBox!.x + noteBox!.width)).toBeLessThan(120)
})
