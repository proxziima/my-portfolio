import { describe, expect, it } from 'vitest'
import { reduceMonitorFocus, UNFOCUSED, wantsMonitor, type MonitorEvent } from '@/features/desk/monitor-focus'

const after = (...events: MonitorEvent[]) => events.reduce(reduceMonitorFocus, UNFOCUSED)

describe('monitor focus', () => {
  it('wants the monitor while the pointer is over it', () => {
    expect(wantsMonitor(after('enter'))).toBe(true)
    expect(wantsMonitor(after('enter', 'leave'))).toBe(false)
  })
  it('keeps the monitor while a button pressed inside is held, until release', () => {
    expect(wantsMonitor(after('enter', 'press', 'leave'))).toBe(true)
    expect(wantsMonitor(after('enter', 'press', 'leave', 'release'))).toBe(false)
  })
  it('a release while still over keeps the monitor', () => {
    expect(wantsMonitor(after('enter', 'press', 'release'))).toBe(true)
  })
  it('keyboard focus counts like hovering', () => {
    expect(wantsMonitor(after('focus'))).toBe(true)
    expect(wantsMonitor(after('focus', 'blur'))).toBe(false)
    expect(wantsMonitor(after('focus', 'enter', 'leave'))).toBe(true)
  })
  it('a stray release changes nothing', () => {
    expect(after('release')).toEqual(UNFOCUSED)
  })
})
