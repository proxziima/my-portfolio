// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const m = vi.hoisted(() => ({
  initPostHog: vi.fn(),
  uninstall: vi.fn(),
  stop: vi.fn(),
  observeSections: vi.fn(),
  trackSectionEngagement: vi.fn(),
  trackOsEngagement: vi.fn(),
  stopEngagement: vi.fn(),
  trackOnExit: vi.fn(),
}))
vi.mock('@/lib/analytics/init', () => ({ initPostHog: m.initPostHog }))
vi.mock('@/lib/analytics/delegated', () => ({ installDelegatedTracking: () => m.uninstall }))
vi.mock('@/lib/analytics/sections', () => ({ observeSections: m.observeSections }))
vi.mock('@/lib/analytics/section-engagement', () => ({ trackSectionEngagement: m.trackSectionEngagement }))
vi.mock('@/lib/analytics/os-engagement', () => ({ trackOsEngagement: m.trackOsEngagement }))
vi.mock('@/lib/analytics/events', () => ({ track: vi.fn(), trackOnExit: m.trackOnExit }))

const { Analytics } = await import('@/features/analytics/Analytics')

let host: HTMLElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  m.observeSections.mockReturnValue(m.stop)
  m.trackSectionEngagement.mockReturnValue(m.stopEngagement)
  m.trackOsEngagement.mockReturnValue(m.stopEngagement)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

const render = (config: { token: string; uiHost: string } | null, surface: 'site' | 'os' = 'site') =>
  act(() => root.render(createElement(Analytics, { config, surface })))
const config = { token: 'phc_x', uiHost: 'https://us.posthog.com' }

describe('Analytics', () => {
  it('keeps one setup across re-renders that pass an equal config object', () => {
    render({ token: 'phc_x', uiHost: 'https://us.posthog.com' })
    render({ token: 'phc_x', uiHost: 'https://us.posthog.com' })
    expect(m.initPostHog).toHaveBeenCalledTimes(1)
    expect(m.uninstall).not.toHaveBeenCalled()
  })

  it('sets up again when the token changes, and not at all without a config', () => {
    render(null)
    expect(m.initPostHog).not.toHaveBeenCalled()
    render({ token: 'phc_x', uiHost: 'https://us.posthog.com' })
    render({ token: 'phc_y', uiHost: 'https://us.posthog.com' })
    expect(m.initPostHog).toHaveBeenCalledTimes(2)
    expect(m.uninstall).toHaveBeenCalledTimes(1)
  })

  it('tracks sections and their engaged time on the site', () => {
    render(config, 'site')
    expect(m.observeSections).toHaveBeenCalledTimes(1)
    expect(m.trackSectionEngagement).toHaveBeenCalledWith(m.trackOnExit)
    expect(m.trackOsEngagement).not.toHaveBeenCalled()
    act(() => root.unmount())
    expect(m.stop).toHaveBeenCalled()
    expect(m.stopEngagement).toHaveBeenCalled()
    root = createRoot(host)
  })

  it('tracks engaged time on the OS, flagged standalone when not framed', () => {
    render(config, 'os')
    expect(m.trackOsEngagement).toHaveBeenCalledWith(m.trackOnExit, false)
    expect(m.initPostHog).toHaveBeenCalledWith(config, false)
    expect(m.observeSections).not.toHaveBeenCalled()
    expect(m.trackSectionEngagement).not.toHaveBeenCalled()
  })
})
