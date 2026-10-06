import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../src/testing/test-db'
import { conversations, intentEvaluations, visitors } from '../../src/db/schema'
import { initialConversationState } from '../../src/contract'

let t: TestDb
afterEach(async () => t?.close())

describe('twin schema', () => {
  it('applies the committed migrations into the twin schema', async () => {
    t = await createTestDb()
    const result = await t.db.execute(sql`select table_name from information_schema.tables where table_schema = 'twin' order by 1`)
    const rows = result as unknown as { rows: { table_name: string }[] }
    const names = rows.rows.map((r) => r.table_name)
    expect(names).toEqual(
      expect.arrayContaining(['approvals', 'bookings', 'conversations', 'intent_evaluations', 'rate_limits', 'search_cache', 'spend_ledger', 'transcripts', 'visitors']),
    )
  })

  it('refuses an evaluation without reasons at the database level', async () => {
    t = await createTestDb()
    const [v] = await t.db.insert(visitors).values({}).returning()
    await t.db.insert(conversations).values({ sessionId: 's1', visitorId: v!.id, state: initialConversationState() })
    await expect(
      t.db.insert(intentEvaluations).values({ sessionId: 's1', turnId: 't1', sequence: 1, score: 0, tier: 'cold', reasons: [], signals: {} }),
    ).rejects.toThrow()
  })
})
