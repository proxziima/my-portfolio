import { addUnique, ScheduleCallResult, ScheduleTrigger } from '@repo/twin/contract'
import { setEvaluationOutcome, updateConversation } from '@repo/twin/db'
import { requireIntegration } from '@repo/twin/env'
import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { signBookingRef } from '../lib/booking-ref'
import { db } from '../lib/db'
import { getEnv } from '../lib/env'
import { visitorTimeZoneOf, type Principal } from '../lib/identity'
import { decideScheduleCall, type ScheduleDecision } from '../lib/scheduling'
import { toolGranted } from '../lib/tool-gate'

const tool = defineTool({
  description: 'Show the booking dialog in the chat. Use only on an explicit request to talk, or when the state says the call tier is hot.',
  inputSchema: z.object({ trigger: ScheduleTrigger }),
  outputSchema: ScheduleCallResult,
  async execute({ trigger }, ctx): Promise<ScheduleCallResult> {
    const env = getEnv()
    const cal = requireIntegration(env, 'cal')
    // Decided inside the update so the once-only guard holds under the row lock. A box, not a
    // `let`: TypeScript can't see the callback's assignment and would keep the initial narrowing.
    const outcome: { decision: ScheduleDecision | null } = { decision: null }
    const state = await updateConversation(db(), ctx.session.id, (s) => {
      const decision = decideScheduleCall(s, trigger)
      outcome.decision = decision
      return decision.render ? { ...s, widgetShown: true, toolsUsed: addUnique(s.toolsUsed, 'schedule_call') } : s
    })
    const { decision } = outcome
    if (decision === null) throw new Error(`No schedule decision for ${ctx.session.id}`)
    if (!decision.render) return { status: 'refused', reason: decision.reason }
    if (state.intent.lastEvaluationId) await setEvaluationOutcome(db(), state.intent.lastEvaluationId, 'widget_rendered')
    return {
      status: 'rendered',
      calOrigin: env.CAL_ORIGIN,
      embedScriptUrl: env.CAL_EMBED_SCRIPT_URL,
      calLink: cal.CAL_LINK,
      bookingRef: signBookingRef(ctx.session.id, cal.TWIN_BOOKING_REF_SECRET),
      ownerTimeZone: env.OWNER_TIMEZONE,
      visitorTimeZone: visitorTimeZoneOf(ctx.session.auth.current as Principal | null),
      prefillName: state.visitor.name,
    }
  },
  toModelOutput: (r) => ({
    type: 'text',
    value:
      r.status === 'rendered'
        ? 'The booking dialog is now visible in the chat. Introduce it in one short line; never paste links.'
        : r.reason === 'already_shown'
          ? 'The booking dialog is already in the chat. Point to it; do not show it again.'
          : 'Not shown: the conversation does not call for it yet. Answer normally.',
  }),
})

/** Offered only while a skill granting it is active (spec §5). */
export default defineDynamic({
  events: {
    'step.started': async (_event, ctx) => ((await toolGranted(ctx.session.id, 'schedule_call')) ? tool : null),
  },
})
