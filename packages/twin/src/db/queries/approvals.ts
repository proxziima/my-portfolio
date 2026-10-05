import { and, eq } from 'drizzle-orm'
import type { TwinDb } from '../client'
import { approvals } from '../schema'

/** Persists a pending owner approval and returns its id (also the Telegram callback payload). */
export async function createApproval(
  db: TwinDb,
  a: { sessionId: string; sourceId: string; topic: string; reason: string },
): Promise<string> {
  const [row] = await db.insert(approvals).values(a).returning({ id: approvals.id })
  if (!row) throw new Error('Approval insert returned no row')
  return row.id
}

/** Stores where the decision must be delivered (workflow webhook) and the Telegram message to edit. */
export async function attachApprovalDelivery(
  db: TwinDb,
  id: string,
  delivery: { webhookUrl: string; telegramMessageId: number },
): Promise<void> {
  await db.update(approvals).set(delivery).where(eq(approvals.id, id))
}

/** A settled approval as returned to callers. */
export interface DecidedApproval {
  id: string
  sessionId: string
  sourceId: string
  status: 'approved' | 'denied' | 'expired'
  webhookUrl: string | null
  telegramMessageId: number | null
  decidedAt: Date
}

/**
 * Settles a pending approval exactly once. Returns null if it was already decided, so a late
 * Telegram tap after the timeout (or a double tap) can't flip an outcome.
 */
export async function decideApproval(
  db: TwinDb,
  id: string,
  d: { status: 'approved' | 'denied' | 'expired'; actor: string; reasoning: string },
  now = new Date(),
): Promise<DecidedApproval | null> {
  const [row] = await db
    .update(approvals)
    .set({ status: d.status, actor: d.actor, reasoning: d.reasoning, decidedAt: now })
    .where(and(eq(approvals.id, id), eq(approvals.status, 'pending')))
    .returning()
  if (!row) return null
  return {
    id: row.id,
    sessionId: row.sessionId,
    sourceId: row.sourceId,
    status: d.status,
    webhookUrl: row.webhookUrl,
    telegramMessageId: row.telegramMessageId,
    decidedAt: now,
  }
}
