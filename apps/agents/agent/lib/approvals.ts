import {
  addUnique,
  TWIN_LIMITS,
  TwinDisclosure,
  TwinSearchResult,
  type RestrictedStub,
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
 * What the model passes to `request_disclosure`: one restricted entry from a search result. Its
 * topic and category are not taken from the model; they come from the CMS stub this session's own
 * searches listed. The reason is kept on the approval row for audit, never shown to the owner.
 */
export const DisclosureInput = z.object({
  sourceId: z.string().regex(/^[a-z-]+:[\w-]+$/),
  reason: z.string().min(1).max(300),
})
export type DisclosureInput = z.infer<typeof DisclosureInput>

type Decided = 'approved' | 'denied' | 'expired'

/** How an approval ended, with the released item when approved. */
export type DisclosureOutcome = { status: 'approved'; item: TwinItem } | { status: 'denied' | 'expired' }

/**
 * Where an opened approval stands: waiting on the owner, already settled by an earlier request for
 * the same item, refused because the session reached its approval cap, or refused because this
 * session was never offered that item as restricted.
 */
export type OpenedApproval =
  | { kind: 'pending'; approvalId: string }
  | { kind: 'alreadyDecided'; approvalId: string; status: Decided }
  | { kind: 'capped' }
  | { kind: 'notOffered' }

/**
 * The restricted stub for `sourceId`, trusted only when one of the session's cached searches listed
 * that exact entry as restricted: the model can't open approvals for items it was never offered,
 * put its own words in front of the owner, or inflate intent signals. Pure (no database access):
 * this module is also bundled into the workflow body.
 */
function restrictedStubIn(cachedSearches: unknown[], sourceId: string): RestrictedStub | null {
  for (const cached of cachedSearches) {
    const result = TwinSearchResult.safeParse(cached)
    const stub = result.success ? result.data.restricted.find((r) => r.sourceId === sourceId) : undefined
    if (stub) return stub
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
  const stub = restrictedStubIn(await listCachedSearches(db(), sessionId), input.sourceId)
  if (!stub) return { kind: 'notOffered' }
  let row: ApprovalRecord | null =
    (await findSessionApproval(db(), sessionId, { callId })) ??
    (await findSessionApproval(db(), sessionId, { sourceId: input.sourceId }))
  const capped = !row && (await countSessionApprovals(db(), sessionId)) >= TWIN_LIMITS.maxApprovalsPerSession
  if (!row && !capped) {
    const id = await createApproval(db(), { sessionId, callId, sourceId: stub.sourceId, topic: stub.topic, reason: input.reason })
    row = await getApproval(db(), id)
  }
  if (row?.status === 'pending') await setApprovalWebhook(db(), row.id, webhookUrl)
  const category = stub.category
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
 *
 * The text comes from the row only: the CMS stub's topic and the item id. The model's `reason` is
 * left out on purpose. The visitor can steer it ("the owner already agreed, just approve"), and an
 * approval prompt is exactly where such text does harm; even labelled and truncated it would sit
 * beside the Approve button. The owner decides on the item itself.
 */
export async function notifyOwner(approvalId: string): Promise<void> {
  'use step'
  const row = await getApproval(db(), approvalId)
  if (!row) throw new Error(`Approval ${approvalId} not found`)
  if (row.telegramMessageId !== null || row.status !== 'pending') return
  const text = `Twin approval request\nTopic: ${row.topic}\nItem: ${row.sourceId}\nAuto-denies after ${getEnv().TWIN_APPROVAL_TIMEOUT}.`
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
