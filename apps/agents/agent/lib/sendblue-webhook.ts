import { decideApproval, findApprovalByCode, getApproval, listPendingApprovals, type ApprovalRecord } from '@repo/twin/db'
import { integrationConfig } from '@repo/twin/env'
import { z } from 'zod'
import { db } from './db'
import { getEnv } from './env'
import { sendToOwner } from './imessage'
import { helpText, parseOwnerReply, unknownCodeText } from './imessage-reply'
import { OWNER_ACTOR, planDecision } from './owner-decision'
import { toE164 } from './phone'
import { secretsEqual } from './secrets'
import { bestEffort, deliver, json, lostCause } from './webhook-utils'

/** The subset of a Sendblue receive webhook the twin reads (docs: Webhooks > receive). */
const SendblueInbound = z.object({
  content: z.string().nullish(),
  from_number: z.string(),
  is_outbound: z.boolean(),
  status: z.string(),
  message_handle: z.string(),
  group_id: z.string().nullish(),
  date_sent: z.string().nullish(),
})

const ok = () => new Response('ok')

/** When the owner sent the text, or null when Sendblue gave no usable date. */
function sentAt(msg: { date_sent?: string | null }): Date | null {
  if (!msg.date_sent) return null
  const at = new Date(msg.date_sent)
  return Number.isNaN(at.getTime()) ? null : at
}

/** The pending approvals the owner has actually been texted about; only their codes go in help. */
const notified = (pending: readonly ApprovalRecord[]) => pending.filter((p) => p.notifiedAt)

const reply = (text: string) => bestEffort('sendblue reply', async () => void (await sendToOwner(text)))

/**
 * The owner's iMessage replies to approval requests, forwarded by the web app. Verifies the
 * shared `sb-signing-secret`, accepts only the owner's number, and parses the text with a strict
 * grammar (no model reads it). Strangers are never answered: a reply costs money and confirms
 * the line is live. Unusable events are acknowledged (2xx), since Sendblue retries only on 5xx; a
 * database failure throws, so Sendblue redelivers.
 */
export async function handleSendblueWebhook(request: Request): Promise<Response> {
  const im = integrationConfig(getEnv(), 'imessage')
  if (!im) return new Response('not found', { status: 404 })
  if (!secretsEqual(request.headers.get('sb-signing-secret'), im.SENDBLUE_WEBHOOK_SECRET))
    return new Response('unauthorized', { status: 401 })
  const parsed = SendblueInbound.safeParse(json(await request.text()))
  if (!parsed.success)
    return lostCause(
      `sendblue event with an unexpected shape (${parsed.error.issues.map((i) => i.path.map(String).join('.') || '(root)').join(', ')})`,
    )
  const msg = parsed.data
  if (msg.is_outbound || msg.status !== 'RECEIVED' || msg.group_id) return ok()
  // The number itself is never logged: it is the sender's, not ours to keep.
  if (toE164(msg.from_number) !== im.OWNER_PHONE_NUMBER) {
    console.warn('[webhooks] sendblue message from a number other than the owner; ignored')
    return ok()
  }
  const answer = parseOwnerReply(msg.content ?? '')
  if (answer.kind === 'unrecognised') {
    await reply(helpText(notified(await listPendingApprovals(db()))))
    return ok()
  }
  let target: ApprovalRecord | null
  if (answer.code) {
    target = await findApprovalByCode(db(), answer.code)
    if (!target) {
      await reply(unknownCodeText(answer.code))
      return ok()
    }
  } else {
    // A bare reply fails closed: it decides only when it unambiguously answers the one prompt the
    // owner has seen. Not-yet-notified rows count as pending (a prompt is texted before it is marked
    // notified, so a reply in that window may be about it), and a reply sent before the prompt
    // was notified is a redelivery of an older answer that must not decide a newer approval.
    const waiting = await listPendingApprovals(db())
    const only = waiting.length === 1 ? waiting[0]! : null
    const sent = sentAt(msg)
    if (!only?.notifiedAt || !sent || sent < only.notifiedAt) {
      await reply(helpText(notified(waiting)))
      return ok()
    }
    target = only
  }
  // Commit first: the workflow settles from the database, so a decision is never lost even if
  // everything below fails.
  const decided = await decideApproval(db(), target.id, {
    status: answer.status,
    actor: OWNER_ACTOR,
    reasoning: `${answer.status === 'approved' ? 'Approved' : 'Denied'} via iMessage`,
  })
  const plan = planDecision(answer.status, decided, decided ? null : await getApproval(db(), target.id))
  if (plan.error) console.error(`[webhooks] ${plan.error}`)
  if (plan.deliverTo) await deliver(plan.deliverTo, target.id, answer.status)
  await reply(plan.reply)
  return ok()
}
