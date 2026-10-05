import { JWT } from 'google-auth-library'
import { z } from 'zod'
import type { BusyInterval } from './availability'
import { getEnv } from './env'

const FreeBusyResponse = z.object({
  calendars: z.record(z.string(), z.object({ busy: z.array(z.object({ start: z.string(), end: z.string() })).default([]), errors: z.array(z.unknown()).optional() })),
})

/**
 * Busy intervals of the owner's calendar via `freeBusy.query`, authenticated as a service account
 * the calendar is shared with as "See only free/busy" (freeBusyReader). It can't read or write events.
 */
export async function queryBusy(timeMin: Date, timeMax: Date): Promise<BusyInterval[]> {
  const env = getEnv()
  const client = new JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_JSON.client_email,
    key: env.GOOGLE_SERVICE_ACCOUNT_JSON.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar.freebusy'],
  })
  const res = await client.request({
    url: 'https://www.googleapis.com/calendar/v3/freeBusy',
    method: 'POST',
    data: { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), items: [{ id: env.GOOGLE_CALENDAR_ID }] },
  })
  const calendar = FreeBusyResponse.parse(res.data).calendars[env.GOOGLE_CALENDAR_ID]
  if (!calendar) throw new Error('freeBusy returned no entry for the owner calendar')
  if (calendar.errors && calendar.errors.length > 0) throw new Error(`freeBusy calendar errors: ${JSON.stringify(calendar.errors)}`)
  return calendar.busy
}
