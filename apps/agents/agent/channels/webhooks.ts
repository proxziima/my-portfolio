import { encodeNotice } from '@repo/twin/contract'
import {
  decideApproval,
  getApproval,
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
import { secretsEqual } from '../lib/secrets'
import { answerCallback, markDecided, parseCallback, TelegramUpdate } from '../lib/telegram'
import { deliveryOutcome, planDecision, telegramActor } from '../lib/telegram-decision'

/** Webhooks never act as a visitor: a dedicated service principal, so they queue behind turns. */
const CAL_PRINCIPAL = {
  authenticator: 'cal-webhook',
  principalType: 'service',
  principalId: 'cal-webhook',
  attributes: {},
} as const

const DELIVERY_TIMEOUT_MS = 10_000

const reason = (e: unknown) => (e instanceof Error ? e.message : 'unknown error')

/** A request body as JSON, or null when it isn't (the shape checks below then reject it). */
function json(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * A 2xx for an event that can never succeed, logged loudly. Providers redeliver anything else, so
 * a non-2xx is kept for transient failures worth retrying.
 */
function lostCause(message: string): Response {
  console.warn(`[webhooks] ${message}; acknowledged and ignored`)
  return new Response('ignored')
}

/** An unconfigured integration has no webhook: nothing could verify or act on the request. */
const notConfigured = () => new Response('not found', { status: 404 })

/**
 * Runs a Telegram Bot API call after the decision is committed. A failure is logged, never
 * rethrown: a non-2xx would make Telegram redeliver the same update over and over.
 */
async function bestEffort(what: string, call: () => Promise<void>): Promise<void> {
  try {
    await call()
  } catch (e) {
    console.error(`[webhooks] telegram ${what} failed: ${reason(e)}`)
  }
}

/** Wakes the approval workflow. Its body reads the decision from the database, not this POST. */
async function deliver(url: string, approvalId: string, status: string): Promise<void> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approvalId, status }),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })
    const outcome = deliveryOutcome(res.status)
    if (outcome === 'failed')
      console.error(`[webhooks] approval ${approvalId} delivery responded ${res.status}`)
    if (outcome === 'gone')
      console.warn(`[webhooks] approval ${approvalId} workflow is no longer waiting`)
  } catch (e) {
    console.error(`[webhooks] approval ${approvalId} delivery failed: ${reason(e)}`)
  }
}

/**
 * Inbound webhooks, reached only through the web app's allow-listed forwarders. Each verifies its
 * own signature here, next to the secret (spec §2).
 */
export default defineChannel({
  routes: [
    POST('/webhooks/telegram', async (request) => {
      const telegram = integrationConfig(getEnv(), 'telegram')
      if (!telegram) return notConfigured()
      if (
        !secretsEqual(
          request.headers.get('x-telegram-bot-api-secret-token'),
          telegram.TELEGRAM_WEBHOOK_SECRET,
        )
      )
        return new Response('unauthorized', { status: 401 })
      const update = TelegramUpdate.safeParse(json(await request.text()))
      if (!update.success)
        return lostCause(
          `telegram update with an unexpected shape (${update.error.issues.map((i) => i.path.map(String).join('.') || '(root)').join(', ')})`,
        )
      // Anything but a well-formed decision tap (a chat message, a malformed id) is acknowledged.
      const tap = parseCallback(update.data)
      if (!tap) return new Response('ok')
      if (tap.fromId !== telegram.TELEGRAM_OWNER_USER_ID) {
        await bestEffort('answerCallbackQuery', () => answerCallback(tap.queryId, 'Not allowed.'))
        return new Response('ok')
      }
      // Commit first: the workflow settles from the database, so a decision is never lost even
      // if everything below fails.
      const decided = await decideApproval(db(), tap.approvalId, {
        status: tap.status,
        actor: telegramActor(tap.fromId),
        reasoning: `${tap.status === 'approved' ? 'Approved' : 'Denied'} via Telegram`,
      })
      const plan = planDecision(
        tap,
        decided,
        decided ? null : await getApproval(db(), tap.approvalId),
      )
      if (plan.error) console.error(`[webhooks] ${plan.error}`)
      if (plan.deliverTo) await deliver(plan.deliverTo, tap.approvalId, tap.status)
      await bestEffort('answerCallbackQuery', () => answerCallback(tap.queryId, plan.answer))
      const markText = plan.markText
      if (markText) await bestEffort('editMessageText', () => markDecided(tap.messageId, markText))
      return new Response('ok')
    }),
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
