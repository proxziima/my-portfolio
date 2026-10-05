import { decideApproval, findApprovalByCode, getApproval, listPendingApprovals, type ApprovalRecord } from '@repo/twin/db'
import { integrationConfig } from '@repo/twin/env'
import type { PhotonIMessageChannelConfig, PhotonInboundMessageContext } from 'eve/channels/photon'
import { db } from './db'
import { getEnv } from './env'
import { helpText, parseOwnerReply, unknownCodeText } from './imessage-reply'
import { OWNER_ACTOR, planDecision } from './owner-decision'
import { toE164 } from './phone'
import { bestEffort, deliver, reason } from './webhook-utils'

/** An inbound Photon message, as eve's channel hands it to `onMessage`. */
export type PhotonMessage = Parameters<NonNullable<PhotonIMessageChannelConfig['onMessage']>>[1]

/** Sent when a reply couldn't be committed: Photon was already answered 200, so nothing redelivers it. */
export const RESEND_TEXT = 'That reply could not be recorded. Send it again.'

/** The pending approvals the owner has actually been texted about; only their codes go in help. */
const notified = (pending: readonly ApprovalRecord[]) => pending.filter((p) => p.notifiedAt)

/**
 * The Photon channel's `onMessage`: the owner's replies to approval requests. Shaped like the
 * personal-agent-template's channel (bots dropped, the handle normalised to E.164 before matching),
 * but strangers are never answered: this line exists for approvals, and the twin's public
 * conversation is the web Messenger. Always `null`, so no agent turn starts on this channel; the
 * reply is decided here with a strict grammar (no model reads it) and answered on the thread.
 */
export async function handleOwnerMessage(ctx: PhotonInboundMessageContext, message: PhotonMessage): Promise<null> {
  const im = integrationConfig(getEnv(), 'imessage')
  if (!im || message.author.isBot || message.author.isMe || !ctx.thread.isDM) return null
  // The handle itself is never logged: it is the sender's, not ours to keep.
  if (toE164(message.author.userId) !== im.OWNER_PHONE_NUMBER) {
    console.warn('[photon] message from a number other than the owner; ignored')
    return null
  }
  const reply = (text: string) => bestEffort('photon reply', async () => void (await ctx.thread.post(text)))
  try {
    await answerOwner(message.text, reply)
  } catch (e) {
    console.error(`[photon] owner reply could not be recorded: ${reason(e)}`)
    await reply(RESEND_TEXT)
  }
  return null
}

/** Decides one coded reply, or answers with help. Database failures throw to the caller. */
async function answerOwner(text: string, reply: (text: string) => Promise<void>): Promise<void> {
  const answer = parseOwnerReply(text)
  // Only a coded reply decides. Photon's payload has no service field (iMessage vs SMS), so a bare
  // reply can't be told from an SMS spoof; the code reached nobody but the owner.
  if (answer.kind === 'unrecognised' || !answer.code) {
    await reply(helpText(notified(await listPendingApprovals(db()))))
    return
  }
  const target = await findApprovalByCode(db(), answer.code)
  if (!target) {
    await reply(unknownCodeText(answer.code))
    return
  }
  // Commit first: the workflow settles from the database, so a decision is never lost even if
  // everything below fails.
  const decided = await decideApproval(db(), target.id, {
    status: answer.status,
    actor: OWNER_ACTOR,
    reasoning: `${answer.status === 'approved' ? 'Approved' : 'Denied'} via iMessage`,
  })
  const plan = planDecision(answer.status, decided, decided ? null : await getApproval(db(), target.id))
  if (plan.error) console.error(`[photon] ${plan.error}`)
  if (plan.deliverTo) await deliver(plan.deliverTo, target.id, answer.status)
  await reply(plan.reply)
}
