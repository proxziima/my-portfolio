/** A busy interval from Google free/busy (ISO instants). */
export interface BusyInterval {
  start: string
  end: string
}

/** One day as the twin talks about it; never raw slot lists (scheduling skill). */
export interface DayAvailability {
  date: string
  weekday: string
  availability: 'mostly open' | 'partly open' | 'busy' | 'weekend'
  freeWindows: string[]
}

const WORK_START_HOUR = 9
const WORK_END_HOUR = 18

/** UTC offset in minutes of `zone` at `instant` (Intl only; no tz library). */
function offsetMinutes(zone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(instant)
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name)
  if (!m) return 0
  const sign = m[1] === '-' ? -1 : 1
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0))
}

/** The instant when local wall-clock `date hh:00` happens in `zone`. */
function zonedInstant(date: string, hour: number, zone: string): Date {
  const wall = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`).getTime()
  // Resolve the offset at the instant itself, not at the wall-clock guess, so days that contain a
  // DST change still land on the right hour.
  const first = wall - offsetMinutes(zone, new Date(wall)) * 60_000
  return new Date(wall - offsetMinutes(zone, new Date(first)) * 60_000)
}

const hhmm = (d: Date, zone: string) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)

/** Adds `n` days to a YYYY-MM-DD date. */
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Turns busy intervals into per-day labels over the owner's working hours, with free windows in
 * both zones, so the model can say "Thursday's mostly open, your mornings".
 */
export function summarizeAvailability(input: {
  busy: readonly BusyInterval[]
  startDate: string
  days: number
  ownerTimeZone: string
  visitorTimeZone: string | null
}): DayAvailability[] {
  const busy = input.busy.map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
  return Array.from({ length: input.days }, (_, i): DayAvailability => {
    const date = addDays(input.startDate, i)
    const dayStart = zonedInstant(date, WORK_START_HOUR, input.ownerTimeZone).getTime()
    const dayEnd = zonedInstant(date, WORK_END_HOUR, input.ownerTimeZone).getTime()
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: input.ownerTimeZone, weekday: 'long' }).format(new Date(dayStart))
    if (weekday === 'Saturday' || weekday === 'Sunday') return { date, weekday, availability: 'weekend', freeWindows: [] }
    const overlapping = busy
      .map((b) => ({ start: Math.max(b.start, dayStart), end: Math.min(b.end, dayEnd) }))
      .filter((b) => b.end > b.start)
      .sort((a, b) => a.start - b.start)
    const free: Array<{ start: number; end: number }> = []
    let cursor = dayStart
    for (const b of overlapping) {
      if (b.start > cursor) free.push({ start: cursor, end: b.start })
      cursor = Math.max(cursor, b.end)
    }
    if (cursor < dayEnd) free.push({ start: cursor, end: dayEnd })
    const freeShare = free.reduce((sum, f) => sum + (f.end - f.start), 0) / (dayEnd - dayStart)
    const availability = freeShare >= 0.7 ? 'mostly open' : freeShare >= 0.3 ? 'partly open' : 'busy'
    const label = (f: { start: number; end: number }) => {
      const mine = `${hhmm(new Date(f.start), input.ownerTimeZone)}–${hhmm(new Date(f.end), input.ownerTimeZone)} mine`
      if (!input.visitorTimeZone || input.visitorTimeZone === input.ownerTimeZone) return mine
      return `${mine} (${hhmm(new Date(f.start), input.visitorTimeZone)}–${hhmm(new Date(f.end), input.visitorTimeZone)} yours)`
    }
    return { date, weekday, availability, freeWindows: free.filter((f) => f.end - f.start >= 30 * 60_000).map(label) }
  })
}
