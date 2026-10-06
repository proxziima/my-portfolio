import { createHmac, randomUUID } from 'node:crypto'
import { parseNotice } from '@repo/twin/contract'
import { defineEval, type EveEvalTurn } from 'eve/evals'
import { equals, satisfies } from 'eve/evals/expect'
import { z } from 'zod'
import { statusOf } from '../lib/events'

const Rendered = z.object({ status: z.literal('rendered'), bookingRef: z.string().min(1) })

const SCRIPT = [
  "Are you available for a new role? We're hiring a staff engineer at Acme.",
  'Great, when could we talk?',
  "Let's book something.",
] as const

/** The rendered booking dialog's ref from this turn, or null when it did not render here. */
function renderedRef(turn: EveEvalTurn): string | null {
  const call = turn.toolCalls.find(
    (c) => c.name === 'schedule_call' && statusOf(c.output) === 'rendered',
  )
  return call ? Rendered.parse(call.output).bookingRef : null
}

/**
 * Acceptance (spec §12): an available, hiring visitor reaches a booked call in at most four
 * visitor turns. The dialog renders by turn 3; Cal.com's signed webhook is the 4th message, and
 * the session acknowledges it in the same run.
 */
export default defineEval({
  description: 'acceptance: "are you available?" to a booked call in at most four turns',
  tags: ['live', 'scheduling', 'acceptance'],
  async test(t) {
    const secret = process.env.CAL_WEBHOOK_SECRET
    if (!secret) throw new Error('CAL_WEBHOOK_SECRET is not set; it must match the target agent')

    let turn = await t.send(SCRIPT[0])
    let bookingRef = renderedRef(turn)
    // Stop as soon as the dialog renders: every further visitor turn would count against the four.
    for (const next of SCRIPT.slice(1)) {
      if (bookingRef !== null) break
      turn = await turn.session.send(next)
      bookingRef = renderedRef(turn)
    }
    await t.require(
      bookingRef,
      satisfies((r) => typeof r === 'string', 'dialog rendered by turn 3'),
    )
    if (bookingRef === null) return

    const uid = `live-eval-${randomUUID()}`
    const start = new Date(Date.now() + 7 * 24 * 3600 * 1000)
    start.setUTCHours(14, 0, 0, 0)
    const end = new Date(start.getTime() + 30 * 60 * 1000)
    const body = JSON.stringify({
      triggerEvent: 'BOOKING_CREATED',
      createdAt: new Date().toISOString(),
      payload: {
        uid,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        metadata: { bookingRef },
      },
    })
    const signature = createHmac('sha256', secret).update(body).digest('hex')
    const startIndex = turn.session.state.streamIndex
    const res = await t.target.fetch('/webhooks/cal', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cal-signature-256': signature },
      body,
    })
    await t.require(`${res.status} ${await res.text()}`, equals('200 ok'))

    // The notice is the session's 4th message at most; the twin must answer it in this run.
    const notified = await t.target.watchTurn(turn.sessionId, { startIndex }).result()
    notified.event('message.received', {
      data: {
        message: (m: unknown) =>
          typeof m === 'string' && parseNotice(m)?.kind === 'booking.confirmed',
      },
      count: 1,
    })
    t.check(
      notified.message,
      satisfies((m: string | undefined) => (m ?? '').trim().length > 0, 'acknowledges the booking'),
    )
    t.succeeded()
  },
})
