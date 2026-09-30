import { expect, test as base, type Page } from '@playwright/test'

export const status = (page: Page) => page.getByRole('status')
export const drum = (page: Page) => page.getByRole('button', { name: /Open the role list/ })

/**
 * `goto` resolves on the document, before React hydrates; a click or key press before that is lost.
 * React tags the DOM nodes it has claimed with a `__reactProps$…` key, so wait for that on the drum.
 */
export async function openPortfolio(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  await expect(drum(page)).toBeVisible()
  await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-haspopup="listbox"]')
    return !!button && Object.keys(button).some((key) => key.startsWith('__reactProps$'))
  })
}

/** Console errors that come from Next's dev tooling, not from the app. */
const DEV_NOISE = [
  /\[HMR\]/i,
  /\[Fast Refresh\]/i,
  /WebSocket connection to .*(_next|hmr|webpack-hmr)/i,
  /Download the React DevTools/i,
]

/** Collects console errors and uncaught page errors, minus the dev-only noise above. */
export function collectErrors(page: Page): () => string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (!DEV_NOISE.some((re) => re.test(text))) errors.push(text)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  return () => errors
}

/**
 * `test` with the Spline scene held back. The 4.5 MB scene renders on software WebGL in headless
 * Chromium, which starves requestAnimationFrame (and so Playwright's own actionability checks and the
 * page's rAF-driven animations); none of these tests is about the scene. The figure tests, which are,
 * route the scene themselves (a route registered later takes precedence).
 */
export const test = base.extend<{ sceneHeldBack: void }>({
  sceneHeldBack: [
    async ({ page }, use) => {
      await page.route('**/*.splinecode', () => new Promise<void>(() => {}))
      await use()
    },
    { auto: true },
  ],
})
