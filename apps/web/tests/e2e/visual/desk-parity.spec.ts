import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { openPortfolio } from '../support'
import { comparePng, hasBaseline } from './compare'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const BASE = here('./baseline/')
const OUT = here('../../../test-results/parity/')
const UPDATE = process.env.PARITY_UPDATE === '1'
/** ≤ 0.5 % of pixels may differ, and no differing blob may exceed 64 px² (an edge sliver). */
const MAX_RATIO = 0.005
const MAX_CLUSTER = 64
/** `PARITY_QUERY=deskHost=main` runs the same shots on the main-thread host; by default the worker draws. */
const QUERY = process.env.PARITY_QUERY ?? ''
const HOST = new URLSearchParams(QUERY).get('deskHost') === 'main' ? 'main' : 'worker'

/** Freezes everything time-based so two runs of the same code produce the same pixels. */
async function freeze(page: Page) {
  await page.addStyleTag({ content: '*{animation-play-state:paused!important;transition:none!important} .screen-jitter{animation:none!important}' })
  await page.evaluate(async () => {
    // a seek is asynchronous, and so is putting its frame on screen: wait until the frame at 0 is the
    // one presented, or the shot can catch the frame the video was paused on
    const seeks = [...document.querySelectorAll('video')].map((v) => {
      v.pause()
      if (v.currentTime === 0 && !v.seeking) return Promise.resolve()
      const presented = new Promise<void>((r) => {
        const check: VideoFrameRequestCallback = (_, frame) => (frame.mediaTime === 0 ? r() : void v.requestVideoFrameCallback(check))
        v.requestVideoFrameCallback(check)
      })
      v.currentTime = 0
      return Promise.race([presented, new Promise<void>((r) => setTimeout(r, 3000))])
    })
    await Promise.all(seeks)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  })
}

/** The scene drawn with the models, the pointer never having entered the box: the monitor powered off. */
async function poweredOff(page: Page) {
  const scene = page.locator('[data-anchor="desk-scene"]')
  await page.locator('[data-anchor="figure"]').scrollIntoViewIfNeeded()
  await expect(scene).toHaveAttribute('data-loaded', 'true', { timeout: 60_000 })
  await expect(scene).toHaveAttribute('data-power', 'off')
  await expect(scene.locator('iframe')).toHaveCount(0)
  // the worker host's canvas holds a bitmaprenderer context, the main host's a WebGL one
  const host = await scene.locator('canvas').evaluate((c: HTMLCanvasElement) => (c.getContext('webgl2') ? 'main' : 'worker'))
  expect(host, 'the host these shots are of').toBe(HOST)
}

/**
 * The baselines were taken with the OS booted at load. The monitor now boots on approach: the
 * pointer entering the box (at a corner, off the screen) powers it on, then the OS reaches its
 * desktop so the CRT layers are on, and the pointer goes back to rest.
 */
async function ready(page: Page) {
  const scene = page.locator('[data-anchor="desk-scene"]')
  await page.locator('[data-anchor="figure-box"]').hover({ position: { x: 5, y: 5 } })
  await expect(scene.locator('iframe[title="Desktop"]')).toBeAttached()
  await expect(scene.locator('.screen-fx')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 })
  await page.mouse.move(0, 0)
  await page.waitForTimeout(2500) // the rig settles back to rest
}

async function shoot(page: Page, name: string) {
  const box = page.locator('[data-anchor="figure-box"]')
  const actual = `${OUT}${name}.png`
  mkdirSync(OUT, { recursive: true })
  await freeze(page)
  await box.screenshot({ path: actual })
  const baseline = `${BASE}${name}.png`
  if (UPDATE || !hasBaseline(baseline)) {
    mkdirSync(BASE, { recursive: true })
    copyFileSync(actual, baseline)
    return
  }
  const diff = comparePng(actual, baseline, `${OUT}${name}.diff.png`)
  expect.soft(diff.ratio, `${name}: differing pixel ratio`).toBeLessThanOrEqual(MAX_RATIO)
  expect.soft(diff.largestCluster, `${name}: largest differing cluster`).toBeLessThanOrEqual(MAX_CLUSTER)
}

for (const { width, height } of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`desk parity ${width} ${scheme}`, async ({ page }) => {
      test.setTimeout(180_000)
      await page.setViewportSize({ width, height })
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' })
      await openPortfolio(page, QUERY ? `/?${QUERY}` : '/')
      await poweredOff(page)
      // new with boot-on-approach, so no pre-Phase-1 baseline: the first run records it for review
      await shoot(page, `desk-powered-off-${width}-${scheme}`)
      await ready(page)
      await shoot(page, `desk-${width}-${scheme}`)
      // the monitor pose: hover the screen's centre and let the 2 s tween land
      const box = await page.locator('[data-anchor="figure-box"]').boundingBox()
      if (!box) throw new Error('no box')
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.42)
      await page.waitForTimeout(3000)
      await shoot(page, `monitor-${width}-${scheme}`)
      await page.mouse.move(0, 0)
      await page.waitForTimeout(1500)
      await page.locator('[data-anchor="figure"]').getByRole('button', { name: 'Full screen' }).click()
      await page.waitForTimeout(2000)
      await shoot(page, `fullscreen-${width}-${scheme}`)
    })
  }
}
