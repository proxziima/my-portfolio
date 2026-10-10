import { expect, type Page } from '@playwright/test'
import { ASSETS } from '../../lib/assets/manifest'
import { openPortfolio, test } from './support'

// the models are allowed through: software WebGL is slow in headless Chromium, but one frame is enough
test('the monitor shows the OS and the scene draws a first frame', async ({ page }) => {
  await page.route('**/*.glb', (route) => route.continue())
  await openPortfolio(page)
  await page.locator('[data-anchor="figure"]').scrollIntoViewIfNeeded()
  const scene = page.locator('[data-anchor="desk-scene"]')
  await expect(scene).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 })
  await expect(scene.locator('canvas')).toHaveCount(1)
  // the pointer has not come near: the monitor is a powered-off tube, the OS not even requested
  await expect(scene.getByRole('img', { name: 'Desktop (powered off)' })).toBeAttached()
  await expect(scene.locator('iframe')).toHaveCount(0)
  await page.locator('[data-anchor="figure-box"]').hover()
  await expect(scene.locator('iframe[title="Desktop"]')).toBeAttached({ timeout: 20_000 })
  // the CRT layers sit over the iframe and must let the pointer through to it
  const fx = scene.locator('.screen-fx')
  await expect(fx).toBeAttached()
  await expect(fx).toHaveCSS('pointer-events', 'none')
  // the reference's layers: inner shadow and smudges (images), two loops of static (videos)
  await expect(fx.locator('video')).toHaveCount(2)
  await expect(fx.locator('img')).toHaveCount(2)
  // once the OS shows its desktop the static runs while the figure is on screen
  await expect(fx).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  // the encodes are attached only once the layers can show, in the pipeline's order (smallest passing codec first)
  const expected = [ASSETS.desk.screen.staticBase, ASSETS.desk.screen.staticLayer].map((a) => a.sources.map((s) => [s.src, s.type]))
  await expect
    .poll(() => fx.locator('video').evaluateAll((vs) => vs.map((v) => [...v.querySelectorAll('source')].map((s) => [s.getAttribute('src'), s.type]))))
    .toEqual(expected)
  await expect.poll(() => fx.locator('video').evaluateAll((vs) => (vs as HTMLVideoElement[]).some((v) => !v.paused)), { timeout: 10_000 }).toBe(true)
  // each plays one of its own encodes
  const playing = await fx.locator('video').evaluateAll((vs) => (vs as HTMLVideoElement[]).map((v) => new URL(v.currentSrc).pathname))
  playing.forEach((src, i) => expect(expected[i]!.map(([s]) => s)).toContain(src))
})

test('the pointer entering the figure area boots the OS before it reaches the screen', async ({ page }) => {
  await openPortfolio(page)
  await page.locator('[data-anchor="figure"]').scrollIntoViewIfNeeded()
  const scene = page.locator('[data-anchor="desk-scene"]')
  await expect(scene.getByRole('img', { name: 'Desktop (powered off)' })).toBeAttached({ timeout: 20_000 })
  await expect(scene.locator('iframe')).toHaveCount(0)
  // a corner of the box, nowhere near the screen
  await page.locator('[data-anchor="figure-box"]').hover({ position: { x: 5, y: 5 } })
  await expect(scene.locator('iframe[title="Desktop"]')).toBeAttached({ timeout: 5_000 })
  await expect(scene).toHaveAttribute('data-power', 'on', { timeout: 20_000 })
})

test('keyboard reaches the OS through the powered-off screen', async ({ page }) => {
  await openPortfolio(page)
  const scene = page.locator('[data-anchor="desk-scene"]')
  const slab = scene.getByRole('img', { name: 'Desktop (powered off)' })
  await page.locator('[data-anchor="figure"]').scrollIntoViewIfNeeded()
  await expect(slab).toBeAttached({ timeout: 20_000 })
  await expect(scene.locator('iframe')).toHaveCount(0)
  // Tab from the top of the page onto the screen
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  let reached = false
  for (let i = 0; i < 80 && !reached; i++) {
    await page.keyboard.press('Tab')
    reached = await slab.evaluate((el) => el === document.activeElement).catch(() => false)
  }
  expect(reached, 'Tab reaches the powered-off screen').toBe(true)
  // the OS boots and, once loaded, takes the focus at the same tab position
  await expect
    .poll(() => page.evaluate(() => (document.activeElement as HTMLIFrameElement | null)?.title ?? ''), { timeout: 20_000 })
    .toBe('Desktop')
  await expect(scene.getByRole('img', { name: 'Desktop (powered off)' })).toHaveCount(0)
})

test('full screen boots the OS, and Escape inside the late iframe exits', async ({ page }) => {
  await openPortfolio(page)
  const figure = page.locator('[data-anchor="figure"]')
  await figure.scrollIntoViewIfNeeded()
  const scene = page.locator('[data-anchor="desk-scene"]')
  await expect(scene.getByRole('img', { name: 'Desktop (powered off)' })).toBeAttached({ timeout: 20_000 })
  await expect(scene.locator('iframe')).toHaveCount(0)
  // keyboard activation: the pointer never enters the box, so only full screen can boot it
  await figure.getByRole('button', { name: 'Full screen' }).focus()
  await page.keyboard.press('Enter')
  const box = page.locator('[data-anchor="figure-box"]')
  await expect(box).toHaveAttribute('data-full', 'true')
  await expect(scene.locator('iframe[title="Desktop"]')).toBeAttached({ timeout: 5_000 })
  await expect(scene).toHaveAttribute('data-power', 'on', { timeout: 20_000 })
  // the iframe came after full screen began: Escape pressed inside it still exits
  await page.frameLocator('iframe[title="Desktop"]').locator('body').press('Escape')
  await expect(box).toHaveAttribute('data-full', 'false')
})

test('full screen covers the viewport and Escape restores the box', async ({ page }) => {
  await openPortfolio(page)
  const figure = page.locator('[data-anchor="figure"]')
  await figure.scrollIntoViewIfNeeded()
  const box = page.locator('[data-anchor="figure-box"]')
  await figure.getByRole('button', { name: 'Full screen' }).click()
  await expect(box).toHaveAttribute('data-full', 'true')
  await expect(box.getByRole('button', { name: 'Exit full screen' })).toBeFocused()
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('no viewport')
  await expect.poll(async () => (await box.boundingBox())?.width).toBe(viewport.width)
  await expect.poll(async () => (await box.boundingBox())?.height).toBe(viewport.height)
  await expect(box.getByRole('button', { name: 'Exit full screen' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-fullscreen', 'true')
  await page.keyboard.press('Escape')
  await expect(box).toHaveAttribute('data-full', 'false')
  await expect(figure.getByRole('button', { name: 'Full screen' })).toBeFocused()
  await expect.poll(async () => {
    const r = await box.boundingBox()
    return r ? Math.round((r.width / r.height) * 10) / 10 : 0
  }).toBe(1.5)
  await expect(page.locator('html')).not.toHaveAttribute('data-fullscreen', 'true')
})

test('the mute toggle flips and persists', async ({ page }) => {
  await openPortfolio(page)
  const figure = page.locator('[data-anchor="figure"]')
  await figure.scrollIntoViewIfNeeded()
  const mute = figure.getByRole('button', { name: 'Mute' })
  await expect(mute).toHaveAttribute('aria-pressed', 'false')
  await mute.click()
  await expect(figure.getByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('desk-muted'))).toBe('1')
  await page.reload()
  await expect(page.locator('[data-anchor="figure"]').getByRole('button', { name: 'Unmute' })).toBeVisible()
})

test.describe('on touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  /** The share of the figure box inside the viewport, as the IntersectionObserver measures it. */
  const visibleRatio = (page: Page) =>
    page.locator('[data-anchor="figure-box"]').evaluate((el) => {
      const r = el.getBoundingClientRect()
      const seen = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))
      return r.height ? seen / r.height : 0
    })

  test('the monitor boots as it scrolls into view', async ({ page }) => {
    await page.route('**/*.glb', (route) => route.continue())
    await openPortfolio(page)
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches), 'the emulated phone has no hover').toBe(true)
    const scene = page.locator('[data-anchor="desk-scene"]')
    const box = page.locator('[data-anchor="figure-box"]')
    // the scene mounts 200 px before the box is in view: it stays powered off while under half visible
    await box.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - innerHeight + 60))
    await expect(scene.getByRole('img', { name: 'Desktop (powered off)' })).toBeAttached({ timeout: 20_000 })
    expect(await visibleRatio(page)).toBeLessThan(0.5)
    await page.waitForTimeout(500)
    await expect(scene.locator('iframe')).toHaveCount(0)
    // no tap: scrolling it into view is enough
    await box.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await expect(scene.locator('iframe[title="Desktop"]')).toBeAttached({ timeout: 2_000 })
    // the desktop and the static show while it is on screen
    await expect(scene.locator('.screen-fx')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 })
  })

  // a jump straight to the figure (an anchor, a reload part-way down): the worst case for the lazy scene
  test('the screen is never dark while in view', async ({ page }) => {
    test.setTimeout(90_000)
    await page.route('**/*.glb', (route) => route.continue())
    await openPortfolio(page)
    const box = page.locator('[data-anchor="figure-box"]')
    await box.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    // sampled in the page every 50 ms until a second after the scene shows. The scene is invisible
    // until its first frame with the models (the host fades in on `data-loaded`), so the tube can
    // only be seen dark from then on.
    const samples = await page.evaluate(
      () =>
        new Promise<{ t: number; inView: boolean; shown: boolean; iframe: boolean }[]>((done) => {
          const out: { t: number; inView: boolean; shown: boolean; iframe: boolean }[] = []
          const t0 = performance.now()
          let shownAt = 0
          const id = setInterval(() => {
            const t = performance.now() - t0
            const boxEl = document.querySelector('[data-anchor="figure-box"]')!
            const r = boxEl.getBoundingClientRect()
            const seen = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))
            const scene = document.querySelector('[data-anchor="desk-scene"]')
            const shown = scene?.getAttribute('data-loaded') === 'true'
            if (shown && !shownAt) shownAt = t
            out.push({ t, inView: r.height > 0 && seen / r.height >= 0.5, shown, iframe: !!scene?.querySelector('iframe') })
            if ((shownAt && t - shownAt > 1000) || t > 60_000) {
              clearInterval(id)
              done(out)
            }
          }, 50)
        }),
    )
    expect(samples.some((x) => x.shown), 'the scene showed').toBe(true)
    const firstDark = samples.find((x) => x.inView && x.shown && !x.iframe)
    if (firstDark) {
      // at most the observer's delivery delay: an iframe follows within 300 ms
      const lit = samples.find((x) => x.t > firstDark.t && x.iframe)
      expect(lit, 'an iframe follows the first dark in-view sample').toBeDefined()
      expect(lit!.t - firstDark.t).toBeLessThanOrEqual(300)
    }
    expect(samples.some((x) => x.inView && x.shown && x.iframe)).toBe(true)
  })
})
