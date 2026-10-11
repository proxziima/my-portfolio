// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  posthog: { init: vi.fn(), register: vi.fn(), capture: vi.fn(), captureException: vi.fn() },
  loads: 0,
}))
vi.mock('posthog-js', () => {
  m.loads++
  return { default: m.posthog }
})

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  m.loads = 0
})

const config = { token: 'phc_x', uiHost: 'https://us.posthog.com' }

describe('initPostHog', () => {
  it('loads posthog-js once and initialises it through the first-party relay', async () => {
    const { initPostHog } = await import('@/lib/analytics/init')
    const first = initPostHog(config, false)
    const second = initPostHog(config, false)
    expect(second).toBe(first)
    await first
    expect(m.loads).toBe(1)
    expect(m.posthog.init).toHaveBeenCalledTimes(1)
    expect(m.posthog.init).toHaveBeenCalledWith(
      'phc_x',
      expect.objectContaining({
        api_host: '/relay',
        ui_host: 'https://us.posthog.com',
        defaults: '2026-05-30',
        person_profiles: 'identified_only',
        capture_exceptions: true,
        capture_performance: { web_vitals: true, network_timing: true },
        respect_dnt: true,
      }),
    )
    expect(m.posthog.register).not.toHaveBeenCalled()
  })

  it('does not load posthog-js until asked (no token, no download)', async () => {
    await import('@/lib/analytics/init')
    await import('@/lib/analytics/events')
    expect(m.loads).toBe(0)
  })

  it('inside the monitor iframe, leaves pageviews and replay to the parent page', async () => {
    const { initPostHog } = await import('@/lib/analytics/init')
    await initPostHog(config, true)
    expect(m.posthog.init).toHaveBeenCalledWith(
      'phc_x',
      expect.objectContaining({ capture_pageview: false, capture_pageleave: false, disable_session_recording: true }),
    )
    expect(m.posthog.register).toHaveBeenCalledWith({ embedded: true })
  })

  it('flushes what was tracked before the load, after init and the embedded flag', async () => {
    const { initPostHog } = await import('@/lib/analytics/init')
    const { track } = await import('@/lib/analytics/events')
    track('os_app_opened', { app: 'doom' })
    expect(m.posthog.capture).not.toHaveBeenCalled()
    await initPostHog(config, true)
    expect(m.posthog.capture).toHaveBeenCalledWith('os_app_opened', { app: 'doom' })
    const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0]!
    expect(order(m.posthog.init)).toBeLessThan(order(m.posthog.register))
    expect(order(m.posthog.register)).toBeLessThan(order(m.posthog.capture))
  })
})
