// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const posthog = vi.hoisted(() => ({ capture: vi.fn(), __loaded: false }))
vi.mock('posthog-js', () => ({ default: posthog }))

const { track, trackOnExit } = await import('@/lib/analytics/events')

afterEach(() => {
  posthog.capture.mockClear()
  posthog.__loaded = false
})

describe('track and trackOnExit', () => {
  it('send nothing before PostHog is initialised', () => {
    track('section_viewed', { section: 'work' })
    trackOnExit('section_engaged', { section: 'work', seconds: 3 })
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('trackOnExit sends at once over a beacon, which survives the page unloading', () => {
    posthog.__loaded = true
    trackOnExit('os_engaged', { seconds: 4.2, embedded: true, apps_opened: 2 })
    expect(posthog.capture).toHaveBeenCalledWith('os_engaged', { seconds: 4.2, embedded: true, apps_opened: 2 }, { transport: 'sendBeacon', send_instantly: true })
  })
})
