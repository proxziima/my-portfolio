import {
  addUnique,
  TWIN_LIMITS,
  TwinDisclosure,
  TwinSearchResult,
  type KnowledgeCategory,
  type TwinItem,
} from '@repo/twin/contract'
import {
  countSessionApprovals,
  createApproval,
  decideApproval,
  findSessionApproval,
  getApproval,
  listCachedSearches,
  setApprovalTelegramMessage,
  setApprovalWebhook,
  updateConversation,
  type ApprovalRecord,
} from '@repo/twin/db'
import { z } from 'zod'
import { db } from './db'
import { getEnv } from './env'
import { callPayloadTool } from './payload-mcp'
import { markDecided, sendApprovalRequest } from './telegram'

/**
 * What the model passes to `request_disclosure`: one restricted entry from a search result. The
 * category is not taken from the model; it is looked up in the session's own search results.
 */
export const DisclosureInput = z.object({
  sourceId: z.string().regex(/^[a-z-]+:[\w-]+$/),
  topic: z.string().min(1).max(120),
  reason: z.string().min(1).max(300),
})
export type DisclosureInput = z.infer<typeof DisclosureInput>

type Decided = 'approved' | 'denied' | 'expired'

/** How an approval ended, with the released item when approved. */
export type DisclosureOutcome = { status: 'approved'; item: TwinItem } | { status: 'denied' | 'expired' }

/**
 * Where an opened approval stands: waiting on the owner, already settled by an earlier request for
 * the same item, or refused because the session reached its approval cap.
 */
export type OpenedApproval =
  | { kind: 'pending'; approvalId: string }
  | { kind: 'alreadyDecided'; approvalId: string; status: Decided }
  | { kind: 'capped' }

/**
 * The category of a restricted knowledge entry, trusted only when one of the session's cached
 * searches listed that exact entry as restricted, so the model can't inflate intent signals.
 * Pure (no database access): this module is also bundled into the workflow body.
 */
function restrictedCategoryIn(cachedSearches: unknown[], sourceId: string): KnowledgeCategory | null {
  if (!sourceId.startsWith('knowledge:')) return null
  for (const cached of cachedSearches) {
    const result = TwinSearchResult.safeParse(cached)
    const stub = result.success ? result.data.restricted.find((r) => r.sourceId === sourceId) : undefined
    if (stub?.category) return stub.category
  }
  return null
}

/**
 * Step: open (or reuse) the approval and reflect it in conversation state. Idempotent per tool
 * call; one approval per item per session, so the owner is never asked twice about the same
 * thing; at most `maxApprovalsPerSession` per session. The delivery webhook is stored here,
 * before the owner is notified, so a decision can always find its way back.
 */
export async function openApproval(
  sessionId: string,
  callId: string,
  webhookUrl: string,
  input: DisclosureInput,
): Promise<OpenedApproval> {
  'use step'
  let row: ApprovalRecord | null =
    (await findSessionApproval(db(), sessionId, { callId })) ??
    (await findSessionApproval(db(), sessionId, { sourceId: input.sourceId }))
  const capped = !row && (await countSessionApprovals(db(), sessionId)) >= TWIN_LIMITS.maxApprovalsPerSession
  if (!row && !capped) {
    const id = await createApproval(db(), { sessionId, callId, ...input })
    row = await getApproval(db(), id)
  }
  if (row?.status === 'pending') await setApprovalWebhook(db(), row.id, webhookUrl)
  const category = restrictedCategoryIn(await listCachedSearches(db(), sessionId), input.sourceId)
  await updateConversation(db(), sessionId, (s) => ({
    ...s,
    pendingApprovals:
      row?.status === 'pending' && !s.pendingApprovals.some((p) => p.approvalId === row.id)
        ? [...s.pendingApprovals, { approvalId: row.id, sourceId: row.sourceId, topic: row.topic }]
        : s.pendingApprovals,
    restrictedCategoriesRequested: category
      ? addUnique(s.restrictedCategoriesRequested, category)
      : s.restrictedCategoriesRequested,
    toolsUsed: addUnique(s.toolsUsed, 'request_disclosure'),
  }))
  if (!row) return { kind: 'capped' }
  if (row.status === 'pending') return { kind: 'pending', approvalId: row.id }
  return { kind: 'alreadyDecided', approvalId: row.id, status: row.status }
}

/**
 * Step: notify the owner with Approve/Deny. The stored message id marks the owner as notified, so
 * a retried step or a reused approval never sends twice.
 */
export async function notifyOwner(approvalId: string, input: DisclosureInput): Promise<void> {
  'use step'
  const row = await getApproval(db(), approvalId)
  if (!row) throw new Error(`Approval ${approvalId} not found`)
  if (row.telegramMessageId !== null || row.status !== 'pending') return
  const text = `Twin approval request\nTopic: ${input.topic}\nItem: ${input.sourceId}\nWhy: ${input.reason}\nAuto-denies after ${getEnv().TWIN_APPROVAL_TIMEOUT}.`
  await setApprovalTelegramMessage(db(), approvalId, await sendApprovalRequest(approvalId, text))
}

/** Step: the configured approval deadline (env lives in steps, not the replayed body). */
export async function approvalTimeout(): Promise<string> {
  'use step'
  return getEnv().TWIN_APPROVAL_TIMEOUT
}

/**
 * Step: settle the approval, whatever woke the body (the deadline, a delivered decision, a stray
 * POST to the webhook, or a failed notification). The owner's decision is committed before it is
 * delivered, so expiring here can only claim a still-pending row: anything without a recorded
 * decision fails closed. The database is the source of truth and the final status is read back.
 */
export async function finalizeApproval(sessionId: string, approvalId: string): Promise<Decided> {
  'use step'
  await decideApproval(db(), approvalId, {
    status: 'expired',
    actor: 'system',
    reasoning: 'No owner decision recorded; auto-denied.',
  })
  const row = await getApproval(db(), approvalId)
  if (!row) throw new Error(`Approval ${approvalId} not found`)
  const status = z.enum(['approved', 'denied', 'expired']).parse(row.status)
  // Best effort, driven by the row so a retried step re-attempts it; it never blocks settling.
  if (status === 'expired' && row.actor === 'system' && row.telegramMessageId !== null) {
    try {
      await markDecided(row.telegramMessageId, 'Expired: auto-denied, nothing was shared.')
    } catch (e) {
      console.warn(`[approvals] could not mark approval ${approvalId} expired in Telegram: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }
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
