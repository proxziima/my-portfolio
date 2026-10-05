import { describe, expect, it } from 'vitest'
import { summarizeAvailability } from '../agent/lib/availability'

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
