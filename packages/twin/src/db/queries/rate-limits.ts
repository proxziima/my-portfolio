import { sql } from 'drizzle-orm'
import type { TwinDb } from '../client'
import { rateLimits } from '../schema'

/** Start of the fixed window containing `now`. */
export function windowStart(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000
  return new Date(Math.floor(now.getTime() / ms) * ms)
}

/** Atomically counts one hit in the key's current window and returns the new count. */
export async function hitRateLimit(db: TwinDb, key: string, windowSeconds: number, now = new Date()): Promise<number> {
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: windowStart(now, windowSeconds), count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count })
  if (!row) throw new Error('Rate limit upsert returned no row')
  return row.count
}
