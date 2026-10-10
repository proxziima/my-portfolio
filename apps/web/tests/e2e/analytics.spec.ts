import { gunzipSync } from 'node:zlib'
import { expect, type Page, type Request } from '@playwright/test'
import { openPortfolio, test } from './support'

type CapturedEvent = { event: string; properties: Record<string, unknown> }

/**
 * posthog-js posts `/e/` gzipped (`compression=gzip-js`), as plain JSON, or, for `sendBeacon`, as a
 * form body `data=<base64 JSON>`; all decode to an array or `{ batch }`.
 */
function eventsOf(request: Request): CapturedEvent[] {
  const body = request.postDataBuffer()
  if (!body) return []
  let text: string
  try {
    text = gunzipSync(body).toString('utf8')
  } catch {
    text = body.toString('utf8')
  }
  const form = new URLSearchParams(text).get('data')
  if (text.startsWith('data=') && form) text = Buffer.from(form, 'base64').toString('utf8')
  try {
    const parsed = JSON.parse(text) as unknown
    const list = Array.isArray(parsed) ? parsed : ((parsed as { batch?: unknown[] }).batch ?? [parsed])
    return list as CapturedEvent[]
  } catch {
    return []
  }
}

/**
 * Answers every `/relay/**` request in the browser, so nothing reaches PostHog, and collects the events.
 * posthog-js drops events from bots: it checks `navigator.webdriver` and the `HeadlessChrome` brand,
 * so the page is shown as a plain Chrome (the user agent is set per test below).
 */
async function captureRelay(page: Page): Promise<CapturedEvent[]> {
  const events: CapturedEvent[] = []
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined })
  })
  await page.route('**/relay/**', async (route) => {
    events.push(...eventsOf(route.request()))
    const url = route.request().url()
    const script = url.includes('/static/') || url.endsWith('/config.js')
    await route.fulfill(script ? { status: 200, contentType: 'application/javascript', body: '' } : { status: 200, contentType: 'application/json', body: '{}' })
  })
  return events
}

test.describe('analytics and SEO', () => {
  test.skip(!process.env.POSTHOG_PROJECT_TOKEN, 'needs the dev server started with a (fake) POSTHOG_PROJECT_TOKEN')
  test.use({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' })

  test('posthog-js reports through the first-party relay', async ({ page }) => {
    const events = await captureRelay(page)
    await openPortfolio(page)
    const contact = page.getByRole('navigation', { name: 'Contact' }).getByRole('link').first()
    // keep the outbound tab from opening; the delegated listener runs in the capture phase, before this
    await contact.evaluate((a) => a.addEventListener('click', (e) => e.preventDefault()))
    await contact.click()
    await page.locator('section#work').scrollIntoViewIfNeeded()
    await expect.poll(() => events.map((e) => e.event), { timeout: 15_000 }).toEqual(expect.arrayContaining(['$pageview', 'outbound_click', 'section_viewed']))
    const outbound = events.find((e) => e.event === 'outbound_click')!
    expect(outbound.properties).toMatchObject({ kind: expect.stringMatching(/external|mailto/), href: expect.any(String), channel: expect.any(String) })
    // sections are named by their id, as the dashboards filter them
    await expect.poll(() => events.filter((e) => e.event === 'section_viewed').map((e) => e.properties.section)).toContain('work')
  })

  test('engaged time per section is reported when the page hides', async ({ page }) => {
    const events = await captureRelay(page)
    await openPortfolio(page)
    const work = page.locator('section#work')
    await work.scrollIntoViewIfNeeded()
    // a couple of seconds of real reading: input keeps the visitor engaged
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 1)
      await page.waitForTimeout(500)
    }
    // the tab hides: the exit beacon goes out
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect.poll(() => events.find((e) => e.event === 'section_engaged' && e.properties.section === 'work'), { timeout: 15_000 }).toBeTruthy()
    const engaged = events.find((e) => e.event === 'section_engaged' && e.properties.section === 'work')!
    expect(engaged.properties.seconds).toBeGreaterThanOrEqual(1)
  })

  test('the OS boot reports its load time once the desktop is up', async ({ page }) => {
    const events = await captureRelay(page)
    await page.goto('/os')
    await expect(page.locator('[data-anchor="desktop"]')).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => events.find((e) => e.event === 'experience_ready' && e.properties.experience === 'os_boot'), { timeout: 15_000 }).toBeTruthy()
    const ready = events.find((e) => e.event === 'experience_ready' && e.properties.experience === 'os_boot')!
    expect(Number.isInteger(ready.properties.ms)).toBe(true)
    expect(ready.properties.ms).toBeGreaterThan(0)
  })

  test('the desk monitor boots its OS on approach and only then reports the embedded boot', async ({ page }) => {
    test.setTimeout(90_000)
    const events = await captureRelay(page)
    await page.route('**/*.glb', (route) => route.continue())
    await openPortfolio(page)
    await page.locator('[data-anchor="figure"]').scrollIntoViewIfNeeded()
    const scene = page.locator('[data-anchor="desk-scene"]')
    await expect(scene).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 })
    await expect.poll(() => events.find((e) => e.event === 'experience_ready' && e.properties.experience === 'desk_scene'), { timeout: 15_000 }).toBeTruthy()
    const embeddedBoot = () => events.find((e) => e.event === 'experience_ready' && e.properties.experience === 'os_boot' && e.properties.embedded === true)
    // powered off: no OS document, so no embedded boot at all
    await page.waitForTimeout(1500)
    expect(embeddedBoot()).toBeUndefined()
    await page.locator('[data-anchor="figure-box"]').hover({ position: { x: 5, y: 5 } })
    await expect.poll(embeddedBoot, { timeout: 20_000 }).toBeTruthy()
    expect(Number.isInteger(embeddedBoot()!.properties.ms)).toBe(true)
    // the visitor never used the OS: hiding the tab reports no embedded engaged time
    await page.mouse.move(0, 0)
    await page.waitForTimeout(1500)
    // the tab hiding and returning, in the page and in the OS's own document
    const setVisibility = async (state: 'hidden' | 'visible') => {
      for (const frame of page.frames()) {
        await frame.evaluate((s) => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s })
          document.dispatchEvent(new Event('visibilitychange'))
        }, state)
      }
    }
    const embeddedEngaged = () => events.find((e) => e.event === 'os_engaged' && e.properties.embedded === true)
    await setVisibility('hidden')
    await page.waitForTimeout(1500)
    expect(embeddedEngaged()).toBeUndefined()
    // control: real use inside the OS is counted and reported
    await setVisibility('visible')
    const os = page.frameLocator('iframe[title="Desktop"]')
    await expect(os.locator('[data-anchor="desktop"]')).toBeAttached({ timeout: 20_000 })
    for (let i = 0; i < 3; i++) {
      await os.locator('[data-anchor="desktop"]').dispatchEvent('pointerdown')
      await page.waitForTimeout(600)
    }
    await setVisibility('hidden')
    await expect.poll(embeddedEngaged, { timeout: 15_000 }).toBeTruthy()
    expect(embeddedEngaged()!.properties.seconds).toBeGreaterThanOrEqual(1)
  })

  test('home has canonical, JSON-LD, and robots/sitemap are served', async ({ page, request }) => {
    await page.goto('/')
    // Next prints the root canonical as the bare origin; for http(s) that is the same URL as `<origin>/`
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
    expect(new URL(canonical ?? '').href).toBe(new URL('/', page.url()).href)
    const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}') as { '@graph': Array<{ '@type': string }> }
    expect(jsonLd['@graph'].map((n) => n['@type'])).toEqual(['Person', 'WebSite'])
    // the footer is the page's contentinfo, outside <main>
    expect(await page.locator('main footer').count()).toBe(0)
    const robots = await request.get('/robots.txt')
    expect(robots.status()).toBe(200)
    expect(await robots.text()).toMatch(/Sitemap: \S+\/sitemap\.xml/)
    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.status()).toBe(200)
    expect(await sitemap.text()).toContain('<loc>')
  })

  test('an unknown URL renders the branded 404, not indexed', async ({ page }) => {
    const response = await page.goto('/no-such-page')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'Nothing here.' })).toBeVisible()
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/)
  })
})
