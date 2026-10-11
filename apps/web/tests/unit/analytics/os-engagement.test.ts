// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { countAppOpen, trackOsEngagement } from '@/lib/analytics/os-engagement'

let t = 0
let visibility: DocumentVisibilityState = 'visible'
const setVisibility = (next: DocumentVisibilityState) => {
  visibility = next
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  t = 0
  visibility = 'visible'
  vi.spyOn(performance, 'now').mockImplementation(() => t)
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
})
afterEach(() => vi.restoreAllMocks())

describe('trackOsEngagement', () => {
  it('embedded, counts nothing until the visitor uses the OS: the monitor can be on screen unused', () => {
    const send = vi.fn()
    const stop = trackOsEngagement(send, true)
    t = 20_000
    setVisibility('hidden')
    setVisibility('visible')
    t = 40_000
    window.dispatchEvent(new Event('pagehide'))
    expect(send).not.toHaveBeenCalled()
    stop()
  })

  it('reports engaged seconds, the embedded flag and apps opened on pagehide, then resets', () => {
    const send = vi.fn()
    const stop = trackOsEngagement(send, true)
    window.dispatchEvent(new Event('pointerdown'))
    countAppOpen()
    countAppOpen()
    t = 5_000
    window.dispatchEvent(new Event('pagehide'))
    expect(send).toHaveBeenCalledWith('os_engaged', { seconds: 5, embedded: true, apps_opened: 2 })
    t = 5_400
    window.dispatchEvent(new Event('pagehide'))
    expect(send).toHaveBeenCalledTimes(1)
    t = 7_000
    window.dispatchEvent(new Event('keydown'))
    t = 9_000
    window.dispatchEvent(new Event('pagehide'))
    // the sub-second report at 5.4 s was dropped and reset: 5.4 s to 9 s
    expect(send).toHaveBeenLastCalledWith('os_engaged', { seconds: 3.6, embedded: true, apps_opened: 0 })
    stop()
  })

  it('counts only visible time, and the visitor input keeps it alive', () => {
    const send = vi.fn()
    const stop = trackOsEngagement(send, false)
    t = 3_000
    setVisibility('hidden')
    expect(send).toHaveBeenLastCalledWith('os_engaged', { seconds: 3, embedded: false, apps_opened: 0 })
    t = 60_000
    setVisibility('visible')
    t = 62_000
    setVisibility('hidden')
    expect(send).toHaveBeenLastCalledWith('os_engaged', { seconds: 2, embedded: false, apps_opened: 0 })
    stop()
  })

  it('stops counting IDLE_MS after the last input in the OS', () => {
    const send = vi.fn()
    const stop = trackOsEngagement(send, true)
    window.dispatchEvent(new Event('keydown'))
    t = 120_000
    window.dispatchEvent(new Event('pagehide'))
    expect(send).toHaveBeenCalledWith('os_engaged', { seconds: 30, embedded: true, apps_opened: 0 })
    stop()
  })

  it('reports nothing once stopped', () => {
    const send = vi.fn()
    trackOsEngagement(send, false)()
    t = 5_000
    window.dispatchEvent(new Event('pagehide'))
    expect(send).not.toHaveBeenCalled()
  })
})
