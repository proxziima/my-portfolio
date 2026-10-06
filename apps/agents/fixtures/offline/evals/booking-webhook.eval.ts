import { createHmac, randomUUID } from 'node:crypto'
import { parseNotice } from '@repo/twin/contract'
import { getConversation } from '@repo/twin/db'
import { defineEval } from 'eve/evals'
import { equals, satisfies } from 'eve/evals/expect'
import { z } from 'zod'
import type config from './evals.config'

const Rendered = z.object({ status: z.literal('rendered'), bookingRef: z.string().min(1) })

/**
 * "Are you available?" to a booked call at the plumbing level, in three visitor turns: a plain
 * reply, the widget, then Cal.com's signed webhook confirms the booking and the session hears it.
 */
export default defineEval<typeof config>({
  description: 'a signed Cal.com booking confirms the conversation and notifies the session',
  tags: ['offline', 'acceptance'],
  async test(t) {
    const secret = process.env.CAL_WEBHOOK_SECRET
    if (!secret) throw new Error('CAL_WEBHOOK_SECRET is not set; copy .env.example to .env')

    const asked = await t.send('Are you available?')
    asked.notCalledTool('schedule_call')
    t.check(asked.message, equals('plain reply'))

    const booked = await asked.session.send('BOOK a call')
    const { bookingRef } = Rendered.parse(booked.requireToolCall('schedule_call').output)

    const uid = `offline-${randomUUID()}`
    const startTime = '2026-11-02T14:00:00.000Z'
    const body = JSON.stringify({
      triggerEvent: 'BOOKING_CREATED',
      createdAt: new Date().toISOString(),
      payload: { uid, startTime, endTime: '2026-11-02T14:30:00.000Z', metadata: { bookingRef } },
    })
    const signature = createHmac('sha256', secret).update(body).digest('hex')
    const startIndex = booked.session.state.streamIndex
    const res = await t.target.fetch('/webhooks/cal', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cal-signature-256': signature },
      body,
    })
    await t.require(`${res.status} ${await res.text()}`, equals('200 ok'))

    // The channel queues the notice on the visitor's session; consume that turn.
    const notified = await t.target.watchTurn(booked.sessionId, { startIndex }).result()
    notified.event('message.received', {
      data: {
        message: (m: unknown) =>
          typeof m === 'string' && parseNotice(m)?.kind === 'booking.confirmed',
      },
      count: 1,
    })

    const row = await getConversation(t.context.db, booked.sessionId)
    t.check(
      row?.state.booking,
      satisfies(
        (b: { status: string; uid?: string } | undefined) =>
          b?.status === 'confirmed' && b.uid === uid,
        'booking confirmed for this uid',
      ),
    )
    t.succeeded()
  },
})
