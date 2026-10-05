import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from '../../src/testing/test-db'
import {
  createConversation,
  createVisitor,
  decideApproval,
  createApproval,
  deleteVisitor,
  getConversation,
  hitRateLimit,
  insertEvaluation,
  ownsSession,
  purgeExpired,
  recallVisitorHistory,
  recordSpend,
  spendSince,
  updateConversation,
  getCachedSearch,
  putCachedSearch,
  appendTranscript,
  recentTranscript,
  setEvaluationOutcome,
  setStableKeyHash,
} from '../../src/db'

let t: TestDb
let visitorId: string
beforeEach(async () => {
  t = await createTestDb()
  visitorId = await createVisitor(t.db)
  await createConversation(t.db, 'sess-1', visitorId)
})
afterEach(async () => t.close())

describe('conversations', () => {
  it('reads back a fully defaulted state', async () => {
    const c = await getConversation(t.db, 'sess-1')
    expect(c?.state.intent.tier).toBe('cold')
  })

  it('applies updates atomically and validates before writing', async () => {
    await updateConversation(t.db, 'sess-1', (s) => ({ ...s, turnCount: s.turnCount + 1 }))
    await expect(
      updateConversation(t.db, 'sess-1', (s) => ({ ...s, intent: { ...s.intent, tier: 'boiling' as never } })),
    ).rejects.toThrow()
    expect((await getConversation(t.db, 'sess-1'))?.state.turnCount).toBe(1)
  })

  it('checks session ownership', async () => {
    const other = await createVisitor(t.db)
    expect(await ownsSession(t.db, 'sess-1', visitorId)).toBe(true)
    expect(await ownsSession(t.db, 'sess-1', other)).toBe(false)
  })
})

describe('evaluations', () => {
  it('is idempotent per message and tracks outcome', async () => {
    const row = { sessionId: 'sess-1', turnId: 't1', sequence: 2, score: 4, tier: 'warm' as const, classification: 'evaluating' as const, reasons: ['availability asked'], signals: {}, latencyMs: 120 }
    const id = await insertEvaluation(t.db, row)
    expect(id).not.toBeNull()
    expect(await insertEvaluation(t.db, row)).toBeNull()
    await setEvaluationOutcome(t.db, id!, 'offered')
  })
})

describe('transcripts', () => {
  it('returns the last messages oldest first, ignoring redelivered duplicates', async () => {
    await appendTranscript(t.db, { sessionId: 'sess-1', role: 'visitor', turnId: 't1', sequence: 1, text: 'one' })
    await appendTranscript(t.db, { sessionId: 'sess-1', role: 'twin', turnId: 't1', sequence: 2, text: 'two' })
    await appendTranscript(t.db, { sessionId: 'sess-1', role: 'twin', turnId: 't1', sequence: 2, text: 'two' })
    await appendTranscript(t.db, { sessionId: 'sess-1', role: 'visitor', turnId: 't2', sequence: 1, text: 'three' })
    expect(await recentTranscript(t.db, 'sess-1', 2)).toEqual([
      { role: 'twin', text: 'two' },
      { role: 'visitor', text: 'three' },
    ])
  })
})

describe('approvals', () => {
  it('decides a pending approval exactly once', async () => {
    const id = await createApproval(t.db, { sessionId: 'sess-1', sourceId: 'knowledge:7', topic: 'notice period', reason: 'asked' })
    const first = await decideApproval(t.db, id, { status: 'approved', actor: 'telegram:42', reasoning: 'Approved via Telegram' })
    const second = await decideApproval(t.db, id, { status: 'expired', actor: 'system', reasoning: 'timeout' })
    expect(first?.status).toBe('approved')
    expect(second).toBeNull()
  })
})

describe('rate limits and spend', () => {
  it('counts hits per fixed window', async () => {
    const now = new Date('2026-10-04T12:00:30Z')
    expect(await hitRateLimit(t.db, 'ip:1.2.3.4', 60, now)).toBe(1)
    expect(await hitRateLimit(t.db, 'ip:1.2.3.4', 60, now)).toBe(2)
    expect(await hitRateLimit(t.db, 'ip:1.2.3.4', 60, new Date('2026-10-04T12:01:01Z'))).toBe(1)
  })

  it('sums spend since a point in time, ignoring duplicate keys', async () => {
    await recordSpend(t.db, { idempotencyKey: 'a', sessionId: 'sess-1', modelId: 'm', costUsd: 0.01, inputTokens: 1, outputTokens: 1 })
    await recordSpend(t.db, { idempotencyKey: 'a', sessionId: 'sess-1', modelId: 'm', costUsd: 0.01, inputTokens: 1, outputTokens: 1 })
    await recordSpend(t.db, { idempotencyKey: 'b', sessionId: 'sess-1', modelId: 'm', costUsd: 0.02, inputTokens: 1, outputTokens: 1 })
    expect(await spendSince(t.db, new Date(0))).toBeCloseTo(0.03)
  })
})

describe('search cache', () => {
  it('stores and returns a result per normalised query', async () => {
    await putCachedSearch(t.db, 'sess-1', 'react', { items: [] })
    expect(await getCachedSearch(t.db, 'sess-1', 'react')).toEqual({ items: [] })
    expect(await getCachedSearch(t.db, 'sess-1', 'vue')).toBeNull()
  })
})

describe('retention', () => {
  it('purges visitors idle beyond the retention window with everything they own', async () => {
    const now = new Date('2027-01-10T00:00:00Z')
    const purged = await purgeExpired(t.db, now, 1)
    expect(purged.visitors).toBe(1)
    expect(await getConversation(t.db, 'sess-1')).toBeNull()
  })

  it('deletes one visitor on request', async () => {
    await deleteVisitor(t.db, visitorId)
    expect(await getConversation(t.db, 'sess-1')).toBeNull()
  })
})

describe('visitor history', () => {
  it('summarises earlier sessions, excluding the current one', async () => {
    await updateConversation(t.db, 'sess-1', (s) => ({ ...s, visitor: { name: 'Ana', company: 'Acme' }, topicsCited: ['projects'], callOfferDeclined: true }))
    await createConversation(t.db, 'sess-2', visitorId)
    const h = await recallVisitorHistory(t.db, visitorId, 'sess-2')
    expect(h).toEqual({ visits: 1, name: 'Ana', company: 'Acme', role: undefined, kind: undefined, topics: ['projects'], booked: false, declinedCall: true })
  })

  it('only counts visits from other visitors sharing a volunteered key, never their details', async () => {
    await setStableKeyHash(t.db, visitorId, 'h')
    await updateConversation(t.db, 'sess-1', (s) => ({ ...s, visitor: { name: 'Ana', company: 'Acme' }, callOfferDeclined: true }))
    const b = await createVisitor(t.db)
    await setStableKeyHash(t.db, b, 'h')
    await createConversation(t.db, 'sb', b)
    const h = await recallVisitorHistory(t.db, b, 'sb')
    expect(h).toEqual({ visits: 1, name: undefined, company: undefined, role: undefined, kind: undefined, topics: [], booked: false, declinedCall: false })
  })
})
