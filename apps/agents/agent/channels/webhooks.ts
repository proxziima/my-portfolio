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
      const tap = parseCallback(TelegramUpdate.parse(await request.json()))
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
      const booking = parseCalWebhook(JSON.parse(raw))
      if (!booking) return new Response('ignored')
      const sessionId = verifyBookingRef(booking.bookingRef, env.TWIN_BOOKING_REF_SECRET)
      if (!sessionId) return new Response('bad booking ref', { status: 400 })
      // A purged conversation can't take a booking; a 2xx stops Cal.com retrying a lost cause.
      if (!(await getConversation(db(), sessionId))) {
        console.warn(`[webhooks] booking ${booking.uid} references an unknown session`)
        return new Response('ignored')
      }
      const status = bookingStatusOf(booking.trigger)
      await upsertBooking(db(), {
        uid: booking.uid,
        sessionId,
        status,
        startTime: new Date(booking.startTime),
        endTime: new Date(booking.endTime),
      })
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
