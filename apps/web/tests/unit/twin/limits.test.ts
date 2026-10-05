import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createConversation, createVisitor, recordSpend, updateConversation } from '@repo/twin/db'
import { createTestDb, type TestDb } from '@repo/twin/testing'
import { TWIN_LIMITS } from '@repo/twin/contract'
import { checkMessage } from '@/lib/twin/limits'

let t: TestDb
let visitorId: string
beforeEach(async () => {
  t = await createTestDb()
  visitorId = await createVisitor(t.db)
  await createConversation(t.db, 's1', visitorId)
}, 60_000)
afterEach(async () => t.close())

const now = new Date('2026-10-04T12:00:00Z')
const base = { ip: '1.2.3.4', sessionId: 's1', dailySpendUsd: 5, now }

describe('checkMessage', () => {
  it('allows a normal message', async () => {
    expect(await checkMessage(t.db, { ...base, text: 'hi' })).toBeNull()
  })

  it('rejects over-long messages before counting them', async () => {
    expect(await checkMessage(t.db, { ...base, text: 'x'.repeat(TWIN_LIMITS.messageMaxChars + 1) })).toBe('too_long')
  })

  it('throttles per session per minute', async () => {
    for (let i = 0; i < TWIN_LIMITS.sessionPerMinute; i++) expect(await checkMessage(t.db, { ...base, text: 'hi' })).toBeNull()
    expect(await checkMessage(t.db, { ...base, text: 'hi' })).toBe('throttled')
  })

  it('ends conversations past the turn cap or flagged ended', async () => {
    await updateConversation(t.db, 's1', (s) => ({ ...s, turnCount: TWIN_LIMITS.maxTurnsPerConversation }))
    expect(await checkMessage(t.db, { ...base, text: 'hi' })).toBe('ended')
  })

  it('goes offline when today’s spend reaches the cap', async () => {
    await recordSpend(t.db, { idempotencyKey: 'k', sessionId: 's1', modelId: 'm', costUsd: 5, inputTokens: 1, outputTokens: 1 })
    expect(await checkMessage(t.db, { ...base, text: 'hi' })).toBe('offline')
  })
})
