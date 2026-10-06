import { encodeNotice } from '@repo/twin/contract'
import {
  getConversation,
  setEvaluationOutcome,
  updateConversation,
  upsertBooking,
} from '@repo/twin/db'
import { integrationConfig } from '@repo/twin/env'
import { defineChannel, POST } from 'eve/channels'
import { bookingTransition } from '../lib/booking-transition'
import { verifyBookingRef } from '../lib/booking-ref'
import { bookingStatusOf, parseCalWebhook, verifyCalSignature } from '../lib/cal-webhook'
import { db } from '../lib/db'
import { getEnv } from '../lib/env'
import { json, lostCause, reason } from '../lib/webhook-utils'

/** Webhooks never act as a visitor: a dedicated service principal, so they queue behind turns. */
const CAL_PRINCIPAL = {
  authenticator: 'cal-webhook',
  principalType: 'service',
  principalId: 'cal-webhook',
  attributes: {},
} as const

/** An unconfigured integration has no webhook: nothing could verify or act on the request. */
const notConfigured = () => new Response('not found', { status: 404 })

/**
 * Inbound Cal.com booking webhooks, reached only through the web app's allow-listed forwarder.
 * The webhook verifies its own signature here, next to the secret (spec §2). Photon owner replies
 * have their own channel (`photon.ts`).
 */
export default defineChannel({
  routes: [
    POST('/webhooks/cal', async (request, { attachSession, waitUntil }) => {
      const cal = integrationConfig(getEnv(), 'cal')
      if (!cal) return notConfigured()
      const raw = await request.text()
      if (
        !verifyCalSignature(raw, request.headers.get('x-cal-signature-256'), cal.CAL_WEBHOOK_SECRET)
      )
        return new Response('unauthorized', { status: 401 })
      const parsed = parseCalWebhook(json(raw))
      if (parsed.kind === 'other') return new Response('ignored')
      // Booked directly on Cal.com (no twin booking ref), malformed times or no uid: Cal.com would
      // redeliver the same body forever. Issue paths only, never values, so no attendee data.
      if (parsed.kind === 'invalid')
        return lostCause(`cal ${parsed.trigger} the twin can't use (${parsed.issues.join(', ')})`)
      const booking = parsed.booking
      const sessionId = verifyBookingRef(booking.bookingRef, cal.TWIN_BOOKING_REF_SECRET)
      if (!sessionId)
        return lostCause(`cal ${booking.trigger} ${booking.uid} has an invalid or unverifiable booking ref`)
      // A purged conversation can't take a booking.
      if (!(await getConversation(db(), sessionId)))
        return lostCause(`cal booking ${booking.uid} references an unknown session`)
      const wanted = bookingStatusOf(booking.trigger)
      const change = await upsertBooking(db(), {
        uid: booking.uid,
        sessionId,
        status: wanted,
        startTime: new Date(booking.startTime),
        endTime: new Date(booking.endTime),
      })
      // Cancelled is terminal: a late create/reschedule for a cancelled uid resolves to cancelled.
      const status = change.current === 'cancelled' ? 'cancelled' : wanted
      // Idempotency rests on the conversation state, not the bookings row: the row commits first, so
      // a redelivery after a later step failed sees an unchanged row but a stale state. An unchanged
      // row for a uid the state has moved past is a stale event and is skipped, unless it is a
      // reschedule linking to the recorded uid (its retry after a failed write). Decided inside the
      // locked update, so concurrent deliveries can't both write.
      let transition = { write: false, notify: false }
      const state = await updateConversation(db(), sessionId, (s) => {
        transition = bookingTransition(s.booking, {
          uid: booking.uid,
          status,
          startTime: booking.startTime,
          rowChanged: change.changed,
          rescheduledFrom: booking.rescheduledFrom,
        })
        return transition.write
          ? { ...s, booking: { status, uid: booking.uid, startTime: booking.startTime } }
          : s
      })
      if (!transition.notify) {
        console.info(`[webhooks] cal ${booking.trigger} ${booking.uid} already recorded as ${status}`)
        return new Response('ok')
      }
      // The state is written before the outcome and the notice, so a failure here is never the
      // reason a redelivery skips them: both are caught and logged, and a failed outcome write
      // doesn't block the notice. The one gap is the process dying between the state write and the
      // notice send; a redelivery then finds the state matching and the notice is lost. A notice
      // that was sent but whose acknowledgement failed is never repeated either.
      if (status === 'confirmed' && state.intent.lastEvaluationId) {
        try {
          await setEvaluationOutcome(db(), state.intent.lastEvaluationId, 'booked')
        } catch (e) {
          console.error(`[webhooks] booked outcome for ${sessionId} failed: ${reason(e)}`)
        }
      }
      // The booking is recorded either way; the notice only prompts an in-character
      // acknowledgement, so an ended session just misses it.
      waitUntil(
        attachSession(sessionId)
          .send(encodeNotice({ kind: `booking.${status}`, startTime: booking.startTime }), {
            auth: CAL_PRINCIPAL,
            turnPolicy: 'queue',
          })
          .then((sent) => {
            if (sent.status !== 'accepted')
              console.warn(
                `[webhooks] booking notice for ${sessionId} not delivered: ${sent.status}`,
              )
          })
          .catch((e: unknown) =>
            console.error(`[webhooks] booking notice for ${sessionId} failed: ${reason(e)}`),
          ),
      )
      return new Response('ok')
    }),
  ],
})
