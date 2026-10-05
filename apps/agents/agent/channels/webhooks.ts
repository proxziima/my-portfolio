import { encodeNotice } from '@repo/twin/contract'
import {
  decideApproval,
  getApproval,
  getConversation,
  setEvaluationOutcome,
  updateConversation,
  upsertBooking,
} from '@repo/twin/db'
import { defineChannel, POST } from 'eve/channels'
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
      const env = getEnv()
      if (
        !secretsEqual(
          request.headers.get('x-telegram-bot-api-secret-token'),
          env.TELEGRAM_WEBHOOK_SECRET,
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
      if (tap.fromId !== env.TELEGRAM_OWNER_USER_ID) {
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
      const env = getEnv()
      const raw = await request.text()
      if (
        !verifyCalSignature(raw, request.headers.get('x-cal-signature-256'), env.CAL_WEBHOOK_SECRET)
      )
        return new Response('unauthorized', { status: 401 })
      const parsed = parseCalWebhook(json(raw))
      if (parsed.kind === 'other') return new Response('ignored')
      // Booked directly on Cal.com (no twin booking ref), malformed times or no uid: Cal.com would
      // redeliver the same body forever. Issue paths only, never values, so no attendee data.
      if (parsed.kind === 'invalid')
        return lostCause(`cal ${parsed.trigger} the twin can't use (${parsed.issues.join(', ')})`)
      const booking = parsed.booking
      const sessionId = verifyBookingRef(booking.bookingRef, env.TWIN_BOOKING_REF_SECRET)
      if (!sessionId)
        return lostCause(`cal ${booking.trigger} ${booking.uid} has an invalid or unverifiable booking ref`)
      // A purged conversation can't take a booking.
      if (!(await getConversation(db(), sessionId)))
        return lostCause(`cal booking ${booking.uid} references an unknown session`)
      const status = bookingStatusOf(booking.trigger)
      const change = await upsertBooking(db(), {
        uid: booking.uid,
        sessionId,
        status,
        startTime: new Date(booking.startTime),
        endTime: new Date(booking.endTime),
      })
      // A redelivery, or a late create/reschedule for a cancelled uid, changes nothing: no state
      // update and no second notice.
      if (!change.changed) {
        console.info(`[webhooks] cal ${booking.trigger} ${booking.uid} left booking ${change.current}`)
        return new Response('ok')
      }
      const state = await updateConversation(db(), sessionId, (s) => ({
        ...s,
        booking: { status, uid: booking.uid, startTime: booking.startTime },
      }))
      if (status === 'confirmed' && state.intent.lastEvaluationId)
        await setEvaluationOutcome(db(), state.intent.lastEvaluationId, 'booked')
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
