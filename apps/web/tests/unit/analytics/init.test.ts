// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const posthog = vi.hoisted(() => ({ init: vi.fn(), register: vi.fn(), __loaded: false }))
vi.mock('posthog-js', () => ({ default: posthog }))

afterEach(() => {
  vi.resetModules()
  posthog.init.mockReset()
  posthog.register.mockReset()
})

describe('initPostHog', () => {
  it('initialises once through the first-party relay', async () => {
    const { initPostHog } = await import('@/lib/analytics/init')
    initPostHog({ token: 'phc_x', uiHost: 'https://us.posthog.com' }, false)
    initPostHog({ token: 'phc_x', uiHost: 'https://us.posthog.com' }, false)
    expect(posthog.init).toHaveBeenCalledTimes(1)
    expect(posthog.init).toHaveBeenCalledWith(
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
    expect(posthog.register).not.toHaveBeenCalled()
  })

  it('inside the monitor iframe, leaves pageviews and replay to the parent page', async () => {
    const { initPostHog } = await import('@/lib/analytics/init')
    initPostHog({ token: 'phc_x', uiHost: 'https://us.posthog.com' }, true)
    expect(posthog.init).toHaveBeenCalledWith(
      'phc_x',
      expect.objectContaining({ capture_pageview: false, capture_pageleave: false, disable_session_recording: true }),
    )
    expect(posthog.register).toHaveBeenCalledWith({ embedded: true })
  })
})
