import { gunzipSync } from 'node:zlib'
import { expect, type Page, type Request } from '@playwright/test'
import { openPortfolio, test } from './support'

type CapturedEvent = { event: string; properties: Record<string, unknown> }

/** posthog-js posts `/e/` either gzipped (`compression=gzip-js`) or as plain JSON; both decode to an array or `{ batch }`. */
function eventsOf(request: Request): CapturedEvent[] {
  const body = request.postDataBuffer()
  if (!body) return []
  let text: string
  try {
    text = gunzipSync(body).toString('utf8')
  } catch {
    text = body.toString('utf8')
  }
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
