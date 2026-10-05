import { and, asc, count, eq, ne } from 'drizzle-orm'
import type { TwinDb } from '../client'
import { ApprovalStatus } from '../../contract/state'
import { approvals } from '../schema'

/**
 * Persists a pending owner approval once per tool call and returns its id (also the Telegram
 * callback payload). A retried step or a re-dispatched run with the same call gets the same row.
 */
export async function createApproval(
  db: TwinDb,
  a: { sessionId: string; callId: string; sourceId: string; topic: string; reason: string },
): Promise<string> {
  const [row] = await db
    .insert(approvals)
    .values(a)
    .onConflictDoNothing({ target: [approvals.sessionId, approvals.callId] })
    .returning({ id: approvals.id })
  if (row) return row.id
  const existing = await findSessionApproval(db, a.sessionId, { callId: a.callId })
  if (!existing) throw new Error('Approval insert conflicted but no row was found')
  return existing.id
}

/**
 * Stores where the decision must be delivered. While the approval is pending the newest waiting
 * run's webhook wins, so a reused approval or a re-dispatched run gets the fast wake; an earlier
 * run still wakes at its deadline and reads the decision from the database. Once decided, the
 * webhook never moves.
 */
export async function setApprovalWebhook(db: TwinDb, id: string, webhookUrl: string): Promise<void> {
  await db
    .update(approvals)
    .set({ webhookUrl })
    .where(and(eq(approvals.id, id), eq(approvals.status, 'pending')))
}

/** Records the Telegram message that carries the buttons, which also marks the owner as notified. */
export async function setApprovalTelegramMessage(db: TwinDb, id: string, telegramMessageId: number): Promise<void> {
  await db.update(approvals).set({ telegramMessageId }).where(eq(approvals.id, id))
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

/** An approval as stored, pending or settled. */
export interface ApprovalRecord {
  id: string
  sessionId: string
  sourceId: string
  topic: string
  status: ApprovalStatus
  webhookUrl: string | null
  telegramMessageId: number | null
  decidedAt: Date | null
  actor: string | null
}

function toRecord(row: typeof approvals.$inferSelect): ApprovalRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    sourceId: row.sourceId,
    topic: row.topic,
    status: ApprovalStatus.parse(row.status),
    webhookUrl: row.webhookUrl,
    telegramMessageId: row.telegramMessageId,
    decidedAt: row.decidedAt,
    actor: row.actor,
  }
}

/** Reads one approval, or null when the id is unknown. The status is validated, not trusted. */
export async function getApproval(db: TwinDb, id: string): Promise<ApprovalRecord | null> {
  const [row] = await db.select().from(approvals).where(eq(approvals.id, id))
  return row ? toRecord(row) : null
}

/** The session's approval opened by a tool call, or the oldest one for a source; null if none. */
export async function findSessionApproval(
  db: TwinDb,
  sessionId: string,
  by: { callId: string } | { sourceId: string },
): Promise<ApprovalRecord | null> {
  const match = 'callId' in by ? eq(approvals.callId, by.callId) : eq(approvals.sourceId, by.sourceId)
  const [row] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.sessionId, sessionId), match))
    .orderBy(asc(approvals.requestedAt))
    .limit(1)
  return row ? toRecord(row) : null
}

/**
 * Ids of the session's approvals that are no longer pending. A settled approval never goes back
 * to pending, so pruning these from conversation state can't race a newly opened one.
 */
export async function listSettledApprovalIds(db: TwinDb, sessionId: string): Promise<string[]> {
  const rows = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(and(eq(approvals.sessionId, sessionId), ne(approvals.status, 'pending')))
  return rows.map((r) => r.id)
}

/** How many approvals a session has opened, whatever their outcome. */
export async function countSessionApprovals(db: TwinDb, sessionId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(approvals).where(eq(approvals.sessionId, sessionId))
  return row?.n ?? 0
}
