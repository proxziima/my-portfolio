import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from '../../src/testing/test-db'
import {
  createConversation,
  createVisitor,
  decideApproval,
  createApproval,
  countSessionApprovals,
  findSessionApproval,
  getApproval,
  listCachedSearches,
  setApprovalTelegramMessage,
  setApprovalWebhook,
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
  listSettledApprovalIds,
  upsertBooking,
  schema,
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
  const pending = { sessionId: 'sess-1', callId: 'call-1', sourceId: 'knowledge:7', topic: 'notice period', reason: 'asked' }

  it('decides a pending approval exactly once', async () => {
    const id = await createApproval(t.db, pending)
    const first = await decideApproval(t.db, id, { status: 'approved', actor: 'telegram:42', reasoning: 'Approved via Telegram' })
    const second = await decideApproval(t.db, id, { status: 'expired', actor: 'system', reasoning: 'timeout' })
    expect(first?.status).toBe('approved')
    expect(second).toBeNull()
  })

  it('reads an approval back, pending or settled, and null for an unknown id', async () => {
    const id = await createApproval(t.db, pending)
    expect(await getApproval(t.db, id)).toMatchObject({ id, sessionId: 'sess-1', sourceId: 'knowledge:7', status: 'pending', decidedAt: null, actor: null })
    await decideApproval(t.db, id, { status: 'denied', actor: 'telegram:42', reasoning: 'no' }, new Date('2026-10-05T10:00:00Z'))
    expect(await getApproval(t.db, id)).toMatchObject({ status: 'denied', actor: 'telegram:42', decidedAt: new Date('2026-10-05T10:00:00Z') })
    expect(await getApproval(t.db, '3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f')).toBeNull()
  })

  it('creates one approval per tool call, however often the step retries', async () => {
    const first = await createApproval(t.db, pending)
    expect(await createApproval(t.db, { ...pending, topic: 'retried' })).toBe(first)
    expect(await countSessionApprovals(t.db, 'sess-1')).toBe(1)
    expect(await createApproval(t.db, { ...pending, callId: 'call-2' })).not.toBe(first)
    expect(await countSessionApprovals(t.db, 'sess-1')).toBe(2)
  })

  it('finds a session approval by call id or by source, oldest first', async () => {
    const first = await createApproval(t.db, pending)
    await createApproval(t.db, { ...pending, callId: 'call-2' })
    expect((await findSessionApproval(t.db, 'sess-1', { callId: 'call-1' }))?.id).toBe(first)
    expect((await findSessionApproval(t.db, 'sess-1', { sourceId: 'knowledge:7' }))?.id).toBe(first)
    expect(await findSessionApproval(t.db, 'sess-1', { sourceId: 'knowledge:8' })).toBeNull()
    expect(await findSessionApproval(t.db, 'sess-2', { callId: 'call-1' })).toBeNull()
  })

  it('keeps the newest delivery webhook while pending and stores the telegram message on its own', async () => {
    const id = await createApproval(t.db, pending)
    await setApprovalWebhook(t.db, id, 'https://agents.test/hook/first')
    await setApprovalWebhook(t.db, id, 'https://agents.test/hook/second')
    expect(await getApproval(t.db, id)).toMatchObject({ webhookUrl: 'https://agents.test/hook/second', telegramMessageId: null })
    await setApprovalTelegramMessage(t.db, id, 77)
    expect(await getApproval(t.db, id)).toMatchObject({ webhookUrl: 'https://agents.test/hook/second', telegramMessageId: 77 })
  })

  it('never moves the delivery webhook once the approval is decided', async () => {
    const id = await createApproval(t.db, pending)
    await setApprovalWebhook(t.db, id, 'https://agents.test/hook/first')
    await decideApproval(t.db, id, { status: 'approved', actor: 'telegram:42', reasoning: 'yes' })
    await setApprovalWebhook(t.db, id, 'https://agents.test/hook/late')
    expect(await getApproval(t.db, id)).toMatchObject({ webhookUrl: 'https://agents.test/hook/first' })
  })

  it('lists the ids of a session’s settled approvals, never pending ones or another session’s', async () => {
    const open = await createApproval(t.db, pending)
    const denied = await createApproval(t.db, { ...pending, callId: 'call-2', sourceId: 'knowledge:8' })
    const expired = await createApproval(t.db, { ...pending, callId: 'call-3', sourceId: 'knowledge:9' })
    await decideApproval(t.db, denied, { status: 'denied', actor: 'telegram:42', reasoning: 'no' })
    await decideApproval(t.db, expired, { status: 'expired', actor: 'system', reasoning: 'timeout' })
    const settled = await listSettledApprovalIds(t.db, 'sess-1')
    expect(settled.sort()).toEqual([denied, expired].sort())
    expect(settled).not.toContain(open)
    expect(await listSettledApprovalIds(t.db, 'sess-2')).toEqual([])
  })
})

describe('bookings', () => {
  const at = { startTime: new Date('2026-10-08T14:00:00Z'), endTime: new Date('2026-10-08T14:30:00Z') }
  const booking = (status: string) => ({ uid: 'bk_1', sessionId: 'sess-1', status, ...at })

  it('reports a new booking as a change from nothing', async () => {
    expect(await upsertBooking(t.db, booking('confirmed'))).toEqual({ previous: null, current: 'confirmed', changed: true })
  })

  it('reports a redelivered event as unchanged', async () => {
    await upsertBooking(t.db, booking('confirmed'))
    expect(await upsertBooking(t.db, booking('confirmed'))).toEqual({ previous: 'confirmed', current: 'confirmed', changed: false })
  })

  it('reports a status transition with the previous status', async () => {
    await upsertBooking(t.db, booking('confirmed'))
    expect(await upsertBooking(t.db, booking('cancelled'))).toEqual({ previous: 'confirmed', current: 'cancelled', changed: true })
  })

  it('keeps a cancelled booking cancelled when a late create or reschedule arrives', async () => {
    await upsertBooking(t.db, booking('cancelled'))
    expect(await upsertBooking(t.db, booking('confirmed'))).toEqual({ previous: 'cancelled', current: 'cancelled', changed: false })
    expect(await upsertBooking(t.db, { ...booking('rescheduled'), startTime: new Date('2026-10-09T14:00:00Z') })).toEqual({
      previous: 'cancelled',
      current: 'cancelled',
      changed: false,
    })
    const [row] = await t.db.select().from(schema.bookings)
    expect(row).toMatchObject({ status: 'cancelled', startTime: at.startTime })
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

  it('lists every cached result of a session', async () => {
    await putCachedSearch(t.db, 'sess-1', 'react', { items: [1] })
    await putCachedSearch(t.db, 'sess-1', 'vue', { items: [2] })
    expect(await listCachedSearches(t.db, 'sess-1')).toEqual(expect.arrayContaining([{ items: [1] }, { items: [2] }]))
    expect(await listCachedSearches(t.db, 'sess-2')).toEqual([])
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
