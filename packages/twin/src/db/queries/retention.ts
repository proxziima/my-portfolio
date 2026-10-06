import { eq, lt } from 'drizzle-orm'
import type { TwinDb } from '../client'
import { rateLimits, spendLedger, visitors } from '../schema'

/**
 * Deletes visitors idle longer than `retentionDays` (cascading to conversations, evaluations,
 * approvals, bookings, transcripts and cache), plus stale rate-limit windows and spend rows.
 */
export async function purgeExpired(
  db: TwinDb,
  now: Date,
  retentionDays: number,
): Promise<{ visitors: number; rateLimits: number; spend: number }> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000)
  const v = await db.delete(visitors).where(lt(visitors.lastSeenAt, cutoff)).returning({ id: visitors.id })
  const r = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, new Date(now.getTime() - 2 * 86_400_000)))
    .returning({ key: rateLimits.key })
  const s = await db.delete(spendLedger).where(lt(spendLedger.createdAt, cutoff)).returning({ k: spendLedger.idempotencyKey })
  return { visitors: v.length, rateLimits: r.length, spend: s.length }
}

/** Deletes one visitor and everything they own (the deletion endpoint). */
export async function deleteVisitor(db: TwinDb, visitorId: string): Promise<void> {
  await db.delete(visitors).where(eq(visitors.id, visitorId))
}
