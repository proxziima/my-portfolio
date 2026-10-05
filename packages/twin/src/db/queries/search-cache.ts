import { and, eq } from 'drizzle-orm'
import type { TwinDb } from '../client'
import { searchCache } from '../schema'

/** Cached knowledge-base result for this session and normalised query, or null. */
export async function getCachedSearch(db: TwinDb, sessionId: string, queryNorm: string): Promise<unknown | null> {
  const [row] = await db
    .select({ result: searchCache.result })
    .from(searchCache)
    .where(and(eq(searchCache.sessionId, sessionId), eq(searchCache.queryNorm, queryNorm)))
  return row ? row.result : null
}

/** Stores a result; a concurrent duplicate keeps the first write. */
export async function putCachedSearch(db: TwinDb, sessionId: string, queryNorm: string, result: unknown): Promise<void> {
  await db.insert(searchCache).values({ sessionId, queryNorm, result }).onConflictDoNothing()
}

/** Every cached result of a session, unparsed (callers validate against the contract). */
export async function listCachedSearches(db: TwinDb, sessionId: string): Promise<unknown[]> {
  const rows = await db.select({ result: searchCache.result }).from(searchCache).where(eq(searchCache.sessionId, sessionId))
  return rows.map((r) => r.result)
}
