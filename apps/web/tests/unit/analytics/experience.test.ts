import { describe, expect, it, vi } from 'vitest'
import { startExperience } from '@/lib/analytics/experience'

/** A clock that returns these readings in turn, then keeps the last. */
const clock = (...readings: number[]) => {
  let i = 0
  return () => readings[Math.min(i++, readings.length - 1)] ?? 0
}

describe('startExperience', () => {
  it('reports ready with whole milliseconds since the start', () => {
    const send = vi.fn()
    startExperience('os_boot', {}, { send, now: clock(100, 1334.6) }).ready()
    expect(send).toHaveBeenCalledWith('experience_ready', { experience: 'os_boot', ms: 1235 })
  })

  it('reports a failure with its reason and no duration', () => {
    const send = vi.fn()
    startExperience('desk_scene', {}, { send, now: clock(0, 50) }).failed('webgl_unavailable')
    expect(send).toHaveBeenCalledWith('experience_failed', { experience: 'desk_scene', reason: 'webgl_unavailable' })
  })

  it('settles once: a second ready or failed is ignored', () => {
    const send = vi.fn()
    const timer = startExperience('twin_first_reply', {}, { send, now: clock(0, 10, 20) })
    timer.ready()
    timer.failed('timeout')
    timer.ready()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('experience_ready', { experience: 'twin_first_reply', ms: 10 })
  })

  it('carries the extra properties on either outcome', () => {
    const send = vi.fn()
    startExperience('dos_app', { app: 'doom' }, { send, now: clock(0, 900) }).ready()
    startExperience('dos_app', { app: 'resume' }, { send, now: clock(0) }).failed('load_error')
    expect(send).toHaveBeenNthCalledWith(1, 'experience_ready', { experience: 'dos_app', ms: 900, app: 'doom' })
    expect(send).toHaveBeenNthCalledWith(2, 'experience_failed', { experience: 'dos_app', reason: 'load_error', app: 'resume' })
  })

  it('defaults to the page clock and the catalog track (a no-op until PostHog loads)', () => {
    expect(() => startExperience('os_boot').ready()).not.toThrow()
  })
})
