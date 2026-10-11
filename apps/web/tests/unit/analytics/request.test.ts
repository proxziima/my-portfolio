import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cookie = `ph_phc_x_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: 'd-1', $sesid: [1, 's-1', 0] }))}`

/** A fresh module per test: the "logged once" flag is module state. */
const load = () => import('@/lib/analytics/request')

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('POSTHOG_PROJECT_TOKEN', 'phc_x')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('clientAnalyticsConfig', () => {
  it('returns the browser token and UI host', async () => {
    const { clientAnalyticsConfig } = await load()
    expect(clientAnalyticsConfig()).toEqual({ token: 'phc_x', uiHost: 'https://us.posthog.com' })
  })
  it('is null without a token', async () => {
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', '')
    const { clientAnalyticsConfig } = await load()
    expect(clientAnalyticsConfig()).toBeNull()
  })
})

describe('posthogIdsFromRequest', () => {
  it('reads the visitor ids from the cookie header', async () => {
    const { posthogIdsFromRequest } = await load()
    expect(posthogIdsFromRequest(new Request('http://x/', { headers: { cookie } }))).toEqual({ distinctId: 'd-1', sessionId: 's-1' })
  })
})

describe('posthogIdsFromCookieHeader', () => {
  it('accepts a string or the array form Node gives repeated headers', async () => {
    const { posthogIdsFromCookieHeader } = await load()
    expect(posthogIdsFromCookieHeader(cookie)?.distinctId).toBe('d-1')
    expect(posthogIdsFromCookieHeader(['a=1', cookie])?.distinctId).toBe('d-1')
    expect(posthogIdsFromCookieHeader(undefined)).toBeNull()
  })
})

describe('a malformed POSTHOG_REGION', () => {
  it('disables analytics for the request instead of throwing, and is logged once', async () => {
    vi.stubEnv('POSTHOG_REGION', 'mars')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { clientAnalyticsConfig, posthogIdsFromCookieHeader, posthogIdsFromRequest } = await load()
    expect(clientAnalyticsConfig()).toBeNull()
    expect(posthogIdsFromRequest(new Request('http://x/', { headers: { cookie } }))).toBeNull()
    expect(posthogIdsFromCookieHeader(cookie)).toBeNull()
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0]?.join(' ')).toContain('POSTHOG_REGION')
  })
})
