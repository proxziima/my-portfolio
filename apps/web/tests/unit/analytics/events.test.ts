// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

let events: typeof import('@/lib/analytics/events')
const fake = () => ({ capture: vi.fn(), captureException: vi.fn() })

beforeEach(async () => {
  // the queue and the client are module state: each test starts from a fresh document
  vi.resetModules()
  events = await import('@/lib/analytics/events')
})

describe('track before posthog-js has loaded', () => {
  it('queues, then flushes in order with the properties once the client is attached', () => {
    events.track('role_selected', { role: 'x' })
    events.track('section_viewed', { section: 'work' })
    const client = fake()
    events.attach(client)
    expect(client.capture.mock.calls).toEqual([
      ['role_selected', { role: 'x' }],
      ['section_viewed', { section: 'work' }],
    ])
  })

  it('keeps at most 100 events, dropping the oldest', () => {
    for (let i = 0; i < 101; i++) events.track('section_viewed', { section: `s${i}` })
    const client = fake()
    events.attach(client)
    expect(client.capture).toHaveBeenCalledTimes(100)
    expect(client.capture.mock.calls[0]).toEqual(['section_viewed', { section: 's1' }])
    expect(client.capture.mock.calls[99]).toEqual(['section_viewed', { section: 's100' }])
  })

  it('sends nothing once the queue is discarded (no token)', () => {
    events.track('section_viewed', { section: 'work' })
    events.trackOnExit('section_engaged', { section: 'work', seconds: 3 })
    events.discardQueue()
    const client = fake()
    events.attach(client)
    expect(client.capture).not.toHaveBeenCalled()
  })

  it('queues an exit event too and flushes it over a beacon: a hidden tab may well come back', () => {
    events.track('section_viewed', { section: 'work' })
    events.trackOnExit('section_engaged', { section: 'work', seconds: 3 })
    const client = fake()
    events.attach(client)
    expect(client.capture.mock.calls).toEqual([
      ['section_viewed', { section: 'work' }],
      ['section_engaged', { section: 'work', seconds: 3 }, { transport: 'sendBeacon', send_instantly: true }],
    ])
  })

  it('queues a caught exception for the client', () => {
    const error = new Error('boom')
    events.captureException(error)
    const client = fake()
    events.attach(client)
    expect(client.captureException).toHaveBeenCalledWith(error)
  })
})

describe('track once posthog-js has loaded', () => {
  it('sends at once', () => {
    const client = fake()
    events.attach(client)
    events.track('theme_changed', { theme: 'dark' })
    expect(client.capture).toHaveBeenCalledWith('theme_changed', { theme: 'dark' })
  })

  it('trackOnExit sends at once over a beacon, which survives the page unloading', () => {
    const client = fake()
    events.attach(client)
    events.trackOnExit('os_engaged', { seconds: 4.2, embedded: true, apps_opened: 2 })
    expect(client.capture).toHaveBeenCalledWith('os_engaged', { seconds: 4.2, embedded: true, apps_opened: 2 }, { transport: 'sendBeacon', send_instantly: true })
  })
})
