import { addUnique, KnowledgeCategory, TwinDisclosure, type TwinItem } from '@repo/twin/contract'
import {
  attachApprovalDelivery,
  createApproval,
  decideApproval,
  getApproval,
  updateConversation,
} from '@repo/twin/db'
import { z } from 'zod'
import { db } from './db'
import { getEnv } from './env'
import { callPayloadTool } from './payload-mcp'
import { markDecided, sendApprovalRequest } from './telegram'

/** What the model passes to `request_disclosure`: one restricted entry from a search result. */
export const DisclosureInput = z.object({
  sourceId: z.string().regex(/^[a-z-]+:[\w-]+$/),
  topic: z.string().min(1).max(120),
  category: KnowledgeCategory.nullable(),
  reason: z.string().min(1).max(300),
})
export type DisclosureInput = z.infer<typeof DisclosureInput>

/** How an approval ended, with the released item when approved. */
export type DisclosureOutcome =
  { status: 'approved'; item: TwinItem } | { status: 'denied' | 'expired' }

/** Step: persist the pending approval and reflect it in conversation state. */
export async function openApproval(sessionId: string, input: DisclosureInput): Promise<string> {
  'use step'
  const approvalId = await createApproval(db(), {
    sessionId,
    sourceId: input.sourceId,
    topic: input.topic,
    reason: input.reason,
  })
  await updateConversation(db(), sessionId, (s) => ({
    ...s,
    pendingApprovals: [
      ...s.pendingApprovals,
      { approvalId, sourceId: input.sourceId, topic: input.topic },
    ],
    restrictedCategoriesRequested: input.category
      ? addUnique(s.restrictedCategoriesRequested, input.category)
      : s.restrictedCategoriesRequested,
    toolsUsed: addUnique(s.toolsUsed, 'request_disclosure'),
  }))
  return approvalId
}

/** Step: notify the owner with Approve/Deny and remember where the decision must be delivered. */
export async function notifyOwner(
  approvalId: string,
  webhookUrl: string,
  input: DisclosureInput,
): Promise<void> {
  'use step'
  const text = `Twin approval request\nTopic: ${input.topic}\nItem: ${input.sourceId}\nWhy: ${input.reason}\nAuto-denies after ${getEnv().TWIN_APPROVAL_TIMEOUT}.`
  const messageId = await sendApprovalRequest(approvalId, text)
  await attachApprovalDelivery(db(), approvalId, { webhookUrl, telegramMessageId: messageId })
}

/** Step: the configured approval deadline (env lives in steps, not the replayed body). */
export async function approvalTimeout(): Promise<string> {
  'use step'
  return getEnv().TWIN_APPROVAL_TIMEOUT
}

/**
 * Step: settle the approval. The database is the source of truth: a timeout expires it unless
 * the owner's decision landed first, and either way the final status is read back.
 */
export async function finalizeApproval(
  sessionId: string,
  approvalId: string,
  timedOut: boolean,
): Promise<'approved' | 'denied' | 'expired'> {
  'use step'
  if (timedOut) {
    const expired = await decideApproval(db(), approvalId, {
      status: 'expired',
      actor: 'system',
      reasoning: `No decision within ${getEnv().TWIN_APPROVAL_TIMEOUT}; auto-denied.`,
    })
    if (expired?.telegramMessageId) {
      await markDecided(expired.telegramMessageId, 'Expired: auto-denied, nothing was shared.')
    }
  }
  const row = await getApproval(db(), approvalId)
  if (!row) throw new Error(`Approval ${approvalId} not found`)
  const status = z.enum(['approved', 'denied', 'expired']).parse(row.status)
  await updateConversation(db(), sessionId, (s) => ({
    ...s,
    pendingApprovals: s.pendingApprovals.filter((p) => p.approvalId !== approvalId),
    // A retried step must not record the same decision twice.
    approvalDecisions: [
      ...s.approvalDecisions.filter((d) => d.approvalId !== approvalId),
      {
        approvalId,
        sourceId: row.sourceId,
        status,
        decidedAt: (row.decidedAt ?? new Date()).toISOString(),
      },
    ],
  }))
  return status
}

/** Step: fetch the restricted item now that it is approved. */
export async function discloseItem(sourceId: string): Promise<TwinItem> {
  'use step'
  return (await callPayloadTool('twinDisclose', { sourceId }, TwinDisclosure)).item
}
