import { addUnique } from '@repo/twin/contract'
import { updateConversation } from '@repo/twin/db'
import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { summarizeAvailability } from '../lib/availability'
import { db } from '../lib/db'
import { getEnv } from '../lib/env'
import { queryBusy } from '../lib/google-freebusy'
import { visitorTimeZoneOf, type Principal } from '../lib/identity'
import { toolGranted } from '../lib/tool-gate'

const Output = z.object({
  ownerTimeZone: z.string(),
  visitorTimeZone: z.string().nullable(),
  days: z.array(z.object({ date: z.string(), weekday: z.string(), availability: z.string(), freeWindows: z.array(z.string()) })),
})

const tool = defineTool({
  description: 'How open my calendar is over the next days, in both time zones. Read-only; it never books.',
  inputSchema: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('First day, YYYY-MM-DD; defaults to today'),
    days: z.number().int().min(1).max(14).default(7),
  }),
  outputSchema: Output,
  async execute({ startDate, days }, ctx) {
    const env = getEnv()
    const start = startDate ?? new Date().toISOString().slice(0, 10)
    const from = new Date(`${start}T00:00:00Z`)
    const to = new Date(from.getTime() + (days + 1) * 86_400_000)
    const visitorTimeZone = visitorTimeZoneOf(ctx.session.auth.current as Principal | null)
    const summary = summarizeAvailability({ busy: await queryBusy(from, to), startDate: start, days, ownerTimeZone: env.OWNER_TIMEZONE, visitorTimeZone })
    await updateConversation(db(), ctx.session.id, (s) => ({ ...s, toolsUsed: addUnique(s.toolsUsed, 'check_availability') }))
    return { ownerTimeZone: env.OWNER_TIMEZONE, visitorTimeZone, days: summary }
  },
  toModelOutput: (o) => ({
    type: 'text',
    value: `Owner zone ${o.ownerTimeZone}; visitor zone ${o.visitorTimeZone ?? 'unknown'}.\n${o.days.map((d) => `${d.weekday} ${d.date}: ${d.availability}${d.freeWindows.length > 0 ? `; free ${d.freeWindows.join(', ')}` : ''}`).join('\n')}`,
  }),
})

/** Offered only while a skill granting it is active (spec section 5). */
export default defineDynamic({
  events: {
    'step.started': async (_event, ctx) => ((await toolGranted(ctx.session.id, 'check_availability')) ? tool : null),
  },
})
