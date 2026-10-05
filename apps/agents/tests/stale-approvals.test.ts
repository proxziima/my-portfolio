import { initialConversationState } from '@repo/twin/contract'
import { createApproval, createConversation, createVisitor, decideApproval, getConversation, updateConversation } from '@repo/twin/db'
import { createTestDb, type TestDb } from '@repo/twin/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../agent/lib/db', () => ({ db: () => m.db }))

const { pruneSettledApprovals, withoutSettledApprovals } = await import('../agent/lib/conversation')

const entry = (approvalId: string) => ({ approvalId, sourceId: `knowledge:${approvalId}`, topic: 'Notice period' })

describe('withoutSettledApprovals', () => {
  it('drops entries whose approval is settled and keeps the rest in order', () => {
    const s = { ...initialConversationState(), pendingApprovals: [entry('a'), entry('b'), entry('c')] }
    expect(withoutSettledApprovals(s, ['b', 'z']).pendingApprovals).toEqual([entry('a'), entry('c')])
  })

  it('returns the same state when nothing is stale', () => {
    const s = { ...initialConversationState(), pendingApprovals: [entry('a')] }
    expect(withoutSettledApprovals(s, ['z'])).toBe(s)
    expect(withoutSettledApprovals(s, [])).toBe(s)
  })
})

describe('pruneSettledApprovals', () => {
  const SESSION = 'sess-1'
  let t: TestDb
  beforeEach(async () => {
    t = await createTestDb()
    m.db = t.db
    await createConversation(t.db, SESSION, await createVisitor(t.db))
  })
  afterEach(async () => t.close())

  const approval = (callId: string) =>
    createApproval(t.db, { sessionId: SESSION, callId, sourceId: `knowledge:${callId}`, topic: 'Notice period', reason: 'asked' })

  it('removes entries left behind by a run that died while parked, keeping still-pending ones', async () => {
    const dead = await approval('call-1')
    const live = await approval('call-2')
    await updateConversation(t.db, SESSION, (s) => ({ ...s, pendingApprovals: [entry(dead), entry(live)] }))
    await decideApproval(t.db, dead, { status: 'approved', actor: 'telegram:42', reasoning: 'yes' })
    await pruneSettledApprovals(SESSION)
    expect((await getConversation(t.db, SESSION))?.state.pendingApprovals).toEqual([entry(live)])
  })

  it('leaves the state untouched when no approval is settled', async () => {
    const live = await approval('call-1')
    await updateConversation(t.db, SESSION, (s) => ({ ...s, pendingApprovals: [entry(live)] }))
    await pruneSettledApprovals(SESSION)
    expect((await getConversation(t.db, SESSION))?.state.pendingApprovals).toEqual([entry(live)])
  })
})
