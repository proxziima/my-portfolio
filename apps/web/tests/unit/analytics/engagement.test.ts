// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createEngagementClock, IDLE_MS, installActivityListeners, onPageExit, reportableSeconds } from '@/lib/analytics/engagement'

function fakeTime() {
  let t = 0
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('createEngagementClock', () => {
  it('accrues only while active, counting page load as an interaction', () => {
    const time = fakeTime()
    const clock = createEngagementClock(time.now)
    time.advance(5_000)
    expect(clock.seconds()).toBe(0)
    clock.setActive(true)
    time.advance(4_000)
    expect(clock.seconds()).toBe(4)
    clock.setActive(false)
    time.advance(10_000)
    expect(clock.seconds()).toBe(4)
  })

  it('can start idle, so only real input counts', () => {
    const time = fakeTime()
    const clock = createEngagementClock(time.now, false)
    clock.setActive(true)
    time.advance(10_000)
    expect(clock.seconds()).toBe(0)
    clock.activity()
    time.advance(2_000)
    expect(clock.seconds()).toBe(2)
  })

  it('stops IDLE_MS after the last activity and resumes on the next one', () => {
    const time = fakeTime()
    const clock = createEngagementClock(time.now)
    clock.setActive(true)
    time.advance(IDLE_MS + 60_000)
    expect(clock.seconds()).toBe(IDLE_MS / 1000)
    clock.activity()
    time.advance(2_000)
    expect(clock.seconds()).toBe(IDLE_MS / 1000 + 2)
  })

  it('keeps counting while activity stays within IDLE_MS', () => {
    const time = fakeTime()
    const clock = createEngagementClock(time.now)
    clock.setActive(true)
    for (let i = 0; i < 4; i++) {
      time.advance(IDLE_MS - 1_000)
      clock.activity()
    }
    expect(clock.seconds()).toBe((4 * (IDLE_MS - 1_000)) / 1000)
  })

  it('does not count idle time that ends while inactive', () => {
    const time = fakeTime()
    const clock = createEngagementClock(time.now)
    clock.setActive(true)
    time.advance(1_000)
    clock.setActive(false)
    time.advance(IDLE_MS)
    clock.setActive(true)
    time.advance(5_000)
    expect(clock.seconds()).toBe(1)
  })

  it('reset zeroes the total and keeps the state', () => {
    const time = fakeTime()
    const clock = createEngagementClock(time.now)
    clock.setActive(true)
    time.advance(3_000)
    clock.reset()
    expect(clock.seconds()).toBe(0)
    time.advance(2_000)
    expect(clock.seconds()).toBe(2)
  })
})

describe('reportableSeconds', () => {
  it('rounds to one decimal and drops anything under a second', () => {
    expect(reportableSeconds(0.96)).toBeNull()
    expect(reportableSeconds(1)).toBe(1)
    expect(reportableSeconds(12.345)).toBe(12.3)
  })
})

describe('installActivityListeners', () => {
  it('reports scroll, wheel, pointer, key and touch input until uninstalled', () => {
    const onActivity = vi.fn()
    const target = new EventTarget()
    const uninstall = installActivityListeners(onActivity, target)
    for (const type of ['scroll', 'wheel', 'pointerdown', 'keydown', 'touchstart', 'mousemove']) target.dispatchEvent(new Event(type))
    expect(onActivity).toHaveBeenCalledTimes(5)
    uninstall()
    target.dispatchEvent(new Event('keydown'))
    expect(onActivity).toHaveBeenCalledTimes(5)
  })
})

describe('onPageExit', () => {
  it('flushes when the document hides and on pagehide, not when it shows', () => {
    const flush = vi.fn()
    const uninstall = onPageExit(flush)
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(flush).not.toHaveBeenCalled()
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pagehide'))
    expect(flush).toHaveBeenCalledTimes(2)
    uninstall()
    window.dispatchEvent(new Event('pagehide'))
    expect(flush).toHaveBeenCalledTimes(2)
    visibility.mockRestore()
  })
})
