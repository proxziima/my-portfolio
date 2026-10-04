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

const jsDosScripts = (page: Page) => page.locator('head script[src="/js-dos/js-dos.js"]')

/** Double-clicks a DOS program's shortcut and waits for js-dos to put its canvas in the window. */
async function openDosApp(page: Page, shortcut: string, title: string): Promise<void> {
  await page.getByRole('button', { name: shortcut, exact: true }).dblclick()
  const win = page.getByRole('dialog', { name: title, exact: true })
  await expect(win).toBeVisible()
  await expect(win.locator('footer span').first()).toHaveText('Powered by JSDOS & DOSBox')
  await expect(jsDosScripts(page)).toHaveCount(1)
  await expect(win.locator('[data-anchor="dos-player"] canvas').first()).toBeAttached({ timeout: 30_000 })
}

// DOSBox runs as WASM and the frames are drawn in software in headless Chromium: these allow it time
test('the Doom shortcut boots the shareware bundle in js-dos', async ({ page }) => {
  test.setTimeout(60_000)
  await openDesktop(page)
  await openDosApp(page, 'Doom', 'Doom')
})

test('the AutoCAD shortcut boots Release 12 in js-dos', async ({ page }) => {
  test.setTimeout(60_000)
  await openDesktop(page)
  await openDosApp(page, 'AutoCAD', 'AutoCAD Release 12')
})

test('the My Resume shortcut opens the résumé in Acrobat Reader for DOS', async ({ page }) => {
  test.setTimeout(60_000)
  await openDesktop(page)
  await openDosApp(page, 'My Resume', 'My Resume')
})

test('two DOS programs share one js-dos runtime', async ({ page }) => {
  test.setTimeout(90_000)
  await openDesktop(page)
  await openDosApp(page, 'Doom', 'Doom')
  await openDosApp(page, 'AutoCAD', 'AutoCAD Release 12')
  await expect(jsDosScripts(page)).toHaveCount(1)
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

test('Messenger lists the owner and chats with scripted replies', async ({ page }) => {
  const errors = collectErrors(page)
  await openDesktop(page)
  await page.getByRole('button', { name: 'Messenger', exact: true }).dblclick()
  const messenger = page.getByRole('dialog', { name: 'Windows Live Messenger' })
  await expect(messenger).toBeVisible()

  // the owner sits under Favorites and under Friends; the search filters both
  const owner = messenger.getByRole('button', { name: /Vinicius Queiroz/ })
  await expect(owner).toHaveCount(2)
  await messenger.getByRole('searchbox').fill('zzz')
  await expect(owner).toHaveCount(0)
  await messenger.getByRole('searchbox').fill('')

  await owner.first().dblclick()
  const chat = page.getByRole('dialog', { name: 'Vinicius Queiroz - Conversation' })
  await expect(chat).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Taskbar' }).getByRole('button', { name: 'Vinicius Queiroz - Conversation' })).toBeVisible()

  const box = chat.getByRole('textbox', { name: 'Message Vinicius Queiroz' })
  await box.fill('hello there')
  await box.press('Enter')
  const log = chat.getByRole('log')
  await expect(log.getByText('hello there')).toBeVisible()
  const typing = chat.getByText('Vinicius Queiroz is typing a message...')
  await expect(typing).toBeVisible()
  await expect(log.locator('li li')).toHaveCount(2, { timeout: 5_000 })
  await expect(typing).toBeHidden()
  await expect(box).toBeFocused()
  expect(errors()).toEqual([])
})

test('the keyboard opens the conversation from the contact list', async ({ page }) => {
  await openDesktop(page)
  await page.getByRole('button', { name: 'Messenger', exact: true }).dblclick()
  const owner = page.getByRole('dialog', { name: 'Windows Live Messenger' }).getByRole('button', { name: /Vinicius Queiroz/ }).last()
  await owner.focus()
  await owner.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Vinicius Queiroz - Conversation' })).toBeVisible()
})

test('the conversation has no desktop shortcut', async ({ page }) => {
  await openDesktop(page)
  await expect(page.getByRole('button', { name: /Conversation/ })).toHaveCount(0)
})
