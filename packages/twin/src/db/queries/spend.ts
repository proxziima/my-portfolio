import { gte, sql, sum } from 'drizzle-orm'
import type { TwinDb } from '../client'
import { spendLedger } from '../schema'

/**
 * Records one model call. eve reports tokens and provider metadata (where OpenRouter's cost
 * lives) in separate events, so both upsert the same key and the larger value wins.
 */
export async function recordSpend(
  db: TwinDb,
  s: { idempotencyKey: string; sessionId: string; modelId: string; costUsd: number; inputTokens: number; outputTokens: number },
): Promise<void> {
  await db
    .insert(spendLedger)
    .values(s)
    .onConflictDoUpdate({
      target: spendLedger.idempotencyKey,
      set: {
        costUsd: sql`greatest(${spendLedger.costUsd}, excluded.cost_usd)`,
        inputTokens: sql`greatest(${spendLedger.inputTokens}, excluded.input_tokens)`,
        outputTokens: sql`greatest(${spendLedger.outputTokens}, excluded.output_tokens)`,
      },
    })
}

/** Total recorded spend since `since` (the BFF passes the start of the UTC day). */
export async function spendSince(db: TwinDb, since: Date): Promise<number> {
  const [row] = await db.select({ total: sum(spendLedger.costUsd) }).from(spendLedger).where(gte(spendLedger.createdAt, since))
  return Number(row?.total ?? 0)
}
