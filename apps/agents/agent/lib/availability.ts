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
/** How far ahead a visitor may ask about. */
export const MAX_DAYS_AHEAD = 90

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

/** Today's calendar date (YYYY-MM-DD) in `zone`, which is not the UTC date near midnight. */
export function ownerToday(zone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** True when `date` is YYYY-MM-DD and names a real calendar day (so not 2026-02-31). */
function isCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const d = new Date(`${date}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date
}

/**
 * The first day to report: `startDate` when given, else today in the owner's zone. A date that is
 * not a real day, is before the owner's today or is more than `MAX_DAYS_AHEAD` days out throws,
 * with a message the model can act on (eve reports tool errors to the model).
 */
export function resolveStartDate(startDate: string | undefined, zone: string, now: Date): string {
  const today = ownerToday(zone, now)
  if (startDate === undefined) return today
  // YYYY-MM-DD strings compare in calendar order.
  if (!isCalendarDate(startDate) || startDate < today || startDate > addDays(today, MAX_DAYS_AHEAD)) {
    throw new Error(`startDate must be a real YYYY-MM-DD date between today (${today}) and ${MAX_DAYS_AHEAD} days ahead`)
  }
  return startDate
}

/**
 * The free/busy query window: from the start of `startDate` to the end of its last day, both in
 * the owner's zone, so days on either side of a DST change keep their own offset.
 */
export function availabilityWindow(startDate: string, days: number, zone: string): { from: Date; to: Date } {
  return { from: zonedInstant(startDate, 0, zone), to: zonedInstant(addDays(startDate, days), 0, zone) }
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
