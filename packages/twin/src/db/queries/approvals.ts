import { randomInt } from 'node:crypto'
import { and, asc, count, desc, eq, gt, isNull, ne } from 'drizzle-orm'
import type { TwinDb } from '../client'
import { ApprovalStatus } from '../../contract/state'
import { approvals } from '../schema'

/** Reply-code alphabet: no 0/O or 1/I/L, so a code read on a phone is typed back right. */
export const REPLY_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/** A random 4-character reply code. */
export function newReplyCode(): string {
  return Array.from({ length: 4 }, () => REPLY_CODE_ALPHABET[randomInt(REPLY_CODE_ALPHABET.length)]).join('')
}

const CODE_ATTEMPTS = 5

/** True for a unique violation of `constraint`, whether thrown by pg or pglite, or wrapped by drizzle. */
function violates(e: unknown, constraint: string): boolean {
  for (let err: unknown = e; err instanceof Error; err = err.cause) {
    const pgErr = err as Error & { code?: string; constraint?: string }
    if (pgErr.code === '23505' && pgErr.constraint === constraint) return true
  }
  return false
}

/**
 * Persists a pending owner approval once per tool call and returns its id. A retried step or a
 * re-dispatched run with the same call gets the same row. A reply code that collides with
 * another pending approval is redrawn. It must run on the root connection, not inside a
 * transaction, because a unique violation aborts the transaction and the retry would fail.
 */
export async function createApproval(
  db: TwinDb,
  a: { sessionId: string; callId: string; sourceId: string; topic: string; reason: string },
  codes: () => string = newReplyCode,
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const [row] = await db
        .insert(approvals)
        .values({ ...a, replyCode: codes() })
        .onConflictDoNothing({ target: [approvals.sessionId, approvals.callId] })
        .returning({ id: approvals.id })
      if (row) return row.id
      break
    } catch (e) {
      if (!violates(e, 'approvals_pending_code_uq') || attempt >= CODE_ATTEMPTS) throw e
    }
  }
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

/** Marks the owner as texted, once: a repeat call keeps the first timestamp. */
export async function setApprovalNotified(db: TwinDb, id: string, now = new Date()): Promise<void> {
  await db.update(approvals).set({ notifiedAt: now }).where(and(eq(approvals.id, id), isNull(approvals.notifiedAt)))
}

/** A settled approval as returned to callers. */
export interface DecidedApproval {
  id: string
  sessionId: string
  sourceId: string
  status: 'approved' | 'denied' | 'expired'
  topic: string
  replyCode: string
  webhookUrl: string | null
  decidedAt: Date
}

/**
 * Settles a pending approval exactly once. Returns null if it was already decided, so a late
 * owner reply after the timeout (or a double tap) can't flip an outcome.
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
    topic: row.topic,
    replyCode: row.replyCode,
    webhookUrl: row.webhookUrl,
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
  replyCode: string
  notifiedAt: Date | null
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
    replyCode: row.replyCode,
    notifiedAt: row.notifiedAt,
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

const LATE_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * The approval a reply code refers to: the pending one, or else the most recently settled one
 * with that code from the last 24 hours (so a late reply is told what happened). Null otherwise.
 */
export async function findApprovalByCode(db: TwinDb, code: string, now = new Date()): Promise<ApprovalRecord | null> {
  const [pending] = await db.select().from(approvals).where(and(eq(approvals.replyCode, code), eq(approvals.status, 'pending')))
  if (pending) return toRecord(pending)
  const [settled] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.replyCode, code), ne(approvals.status, 'pending'), gt(approvals.decidedAt, new Date(now.getTime() - LATE_REPLY_WINDOW_MS))))
    .orderBy(desc(approvals.decidedAt))
    .limit(1)
  return settled ? toRecord(settled) : null
}

/**
 * Every pending approval, oldest first. It backs bare-reply disambiguation and the help text, and
 * includes rows not yet notified, so a reply racing a new prompt is treated as ambiguous.
 */
export async function listPendingApprovals(db: TwinDb): Promise<ApprovalRecord[]> {
  const rows = await db
    .select()
    .from(approvals)
    .where(eq(approvals.status, 'pending'))
    .orderBy(asc(approvals.requestedAt))
  return rows.map(toRecord)
}
