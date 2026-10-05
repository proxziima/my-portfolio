import { describe, expect, it } from 'vitest'
import { availabilityWindow, ownerToday, resolveStartDate, summarizeAvailability } from '../agent/lib/availability'

const owner = 'America/Sao_Paulo' // UTC-3, no DST
const visitor = 'Europe/Lisbon' // UTC+1 in October

describe('summarizeAvailability', () => {
  it('labels days by free share of the owner working day (09:00–18:00 owner time)', () => {
    const days = summarizeAvailability({
      busy: [
        { start: '2026-10-08T12:00:00Z', end: '2026-10-08T19:00:00Z' }, // Thu 09:00–16:00 owner: 7 of 9 h busy
        { start: '2026-10-09T13:00:00Z', end: '2026-10-09T14:00:00Z' }, // Fri 10:00–11:00 owner: 1 h busy
      ],
      startDate: '2026-10-08',
      days: 3,
      ownerTimeZone: owner,
      visitorTimeZone: visitor,
    })
    expect(days.map((d) => [d.date, d.availability])).toEqual([
      ['2026-10-08', 'busy'],
      ['2026-10-09', 'mostly open'],
      ['2026-10-10', 'weekend'],
    ])
  })

  it('describes free windows in both zones', () => {
    const [thu] = summarizeAvailability({ busy: [{ start: '2026-10-08T12:00:00Z', end: '2026-10-08T19:00:00Z' }], startDate: '2026-10-08', days: 1, ownerTimeZone: owner, visitorTimeZone: visitor })
    expect(thu?.freeWindows).toEqual(['16:00–18:00 mine (20:00–22:00 yours)'])
  })
})

describe('summarizeAvailability across a DST change', () => {
  const ny = 'America/New_York' // EDT (UTC-4) from 2026-03-08

  it('uses the post-change offset on the Monday after spring forward', () => {
    const [mon] = summarizeAvailability({ busy: [{ start: '2026-03-09T13:00:00Z', end: '2026-03-09T14:00:00Z' }], startDate: '2026-03-09', days: 1, ownerTimeZone: ny, visitorTimeZone: null })
    expect(mon).toEqual({ date: '2026-03-09', weekday: 'Monday', availability: 'mostly open', freeWindows: ['10:00–18:00 mine'] })
  })

  it('keeps each day on its own offset when the range spans the change', () => {
    const days = summarizeAvailability({ busy: [{ start: '2026-03-09T13:00:00Z', end: '2026-03-09T14:00:00Z' }], startDate: '2026-03-06', days: 4, ownerTimeZone: ny, visitorTimeZone: null })
    expect(days.map((d) => [d.weekday, d.availability])).toEqual([
      ['Friday', 'mostly open'],
      ['Saturday', 'weekend'],
      ['Sunday', 'weekend'],
      ['Monday', 'mostly open'],
    ])
    expect(days[0]?.freeWindows).toEqual(['09:00–18:00 mine'])
    expect(days[3]?.freeWindows).toEqual(['10:00–18:00 mine'])
  })
})

describe('ownerToday', () => {
  it("is the calendar date in the owner's zone, not UTC", () => {
    expect(ownerToday(owner, new Date('2026-10-06T01:00:00Z'))).toBe('2026-10-05')
    expect(ownerToday('Asia/Tokyo', new Date('2026-10-05T20:00:00Z'))).toBe('2026-10-06')
    expect(ownerToday(owner, new Date('2026-10-06T03:00:00Z'))).toBe('2026-10-06')
  })
})

describe('availabilityWindow', () => {
  it("runs from the owner's midnight on the first day to midnight after the last day", () => {
    const w = availabilityWindow('2026-10-08', 3, owner)
    expect(w.from.toISOString()).toBe('2026-10-08T03:00:00.000Z')
    expect(w.to.toISOString()).toBe('2026-10-11T03:00:00.000Z')
  })

  it('follows the offset change when the window spans DST', () => {
    const w = availabilityWindow('2026-03-07', 2, 'America/New_York')
    expect(w.from.toISOString()).toBe('2026-03-07T05:00:00.000Z')
    expect(w.to.toISOString()).toBe('2026-03-09T04:00:00.000Z')
  })
})

describe('resolveStartDate', () => {
  const now = new Date('2026-10-06T01:00:00Z') // 2026-10-05 in São Paulo

  it("defaults to today in the owner's zone", () => {
    expect(resolveStartDate(undefined, owner, now)).toBe('2026-10-05')
  })

  it('accepts today through 90 days ahead', () => {
    expect(resolveStartDate('2026-10-05', owner, now)).toBe('2026-10-05')
    expect(resolveStartDate('2027-01-03', owner, now)).toBe('2027-01-03')
  })

  it.each(['2026-02-31', '2026-13-01', '2026-10-04', '2027-01-04', 'next week'])('rejects %j with an error the model can act on', (bad) => {
    expect(() => resolveStartDate(bad, owner, now)).toThrow(/startDate must be .*between today \(2026-10-05\) and 90 days ahead/)
  })
})
