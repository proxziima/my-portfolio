import {
  createConversation,
  createVisitor,
  decideApproval,
  getApproval,
  getConversation,
  putCachedSearch,
  setApprovalTelegramMessage,
} from '@repo/twin/db'
import { createTestDb, type TestDb } from '@repo/twin/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  db: null as unknown,
  sendApprovalRequest: vi.fn(async () => 501),
  markDecided: vi.fn(async () => {}),
}))
vi.mock('../agent/lib/db', () => ({ db: () => m.db }))
vi.mock('../agent/lib/env', () => ({ getEnv: () => ({ TWIN_APPROVAL_TIMEOUT: '15m' }) }))
vi.mock('../agent/lib/payload-mcp', () => ({ callPayloadTool: vi.fn() }))
vi.mock('../agent/lib/telegram', () => ({
  sendApprovalRequest: m.sendApprovalRequest,
  markDecided: m.markDecided,
}))

const { finalizeApproval, notifyOwner, openApproval } = await import('../agent/lib/approvals')

const SESSION = 'sess-1'
const HOOK = 'https://agents.test/.well-known/workflow/v1/webhook/tok-1'
const HOOK_2 = 'https://agents.test/.well-known/workflow/v1/webhook/tok-2'
const HOOK_3 = 'https://agents.test/.well-known/workflow/v1/webhook/tok-3'
const input = { sourceId: 'knowledge:5', topic: 'Notice period', reason: 'Recruiter asked when I can start' }

let t: TestDb
beforeEach(async () => {
  t = await createTestDb()
  m.db = t.db
  m.sendApprovalRequest.mockReset().mockResolvedValue(501)
  m.markDecided.mockReset().mockResolvedValue(undefined)
  await createConversation(t.db, SESSION, await createVisitor(t.db))
})
afterEach(async () => t.close())

const state = async () => (await getConversation(t.db, SESSION))!.state

async function opened(callId: string, source = input.sourceId): Promise<string> {
  const o = await openApproval(SESSION, callId, HOOK, { ...input, sourceId: source })
  if (o.kind !== 'pending') throw new Error(`expected a pending approval, got ${o.kind}`)
  return o.approvalId
}

describe('openApproval', () => {
  it('is idempotent per tool call: one row, one pending entry, webhook stored before any send', async () => {
    const first = await opened('call-1')
    const again = await opened('call-1')
    expect(again).toBe(first)
    expect((await state()).pendingApprovals).toEqual([{ approvalId: first, sourceId: 'knowledge:5', topic: 'Notice period' }])
    expect(await getApproval(t.db, first)).toMatchObject({ webhookUrl: HOOK, telegramMessageId: null })
  })

  it('reuses a pending approval for the same source instead of asking the owner again', async () => {
    const first = await opened('call-1')
    expect(await opened('call-2')).toBe(first)
    await notifyOwner(first, input)
    await notifyOwner(first, input)
    expect(m.sendApprovalRequest).toHaveBeenCalledTimes(1)
    expect((await state()).pendingApprovals).toHaveLength(1)
  })

  it('hands the fast wake to the newest waiting run: a reused or re-dispatched approval stores its webhook', async () => {
    const first = await opened('call-1')
    await openApproval(SESSION, 'call-2', HOOK_2, input)
    expect(await getApproval(t.db, first)).toMatchObject({ webhookUrl: HOOK_2 })
    await openApproval(SESSION, 'call-1', HOOK_3, input)
    expect(await getApproval(t.db, first)).toMatchObject({ webhookUrl: HOOK_3 })
  })

  it('returns the outcome of an already decided approval for the same source', async () => {
    const first = await opened('call-1')
    await decideApproval(t.db, first, { status: 'denied', actor: 'telegram:42', reasoning: 'no' })
    expect(await openApproval(SESSION, 'call-2', HOOK_2, input)).toEqual({ kind: 'alreadyDecided', approvalId: first, status: 'denied' })
    // A decided approval keeps the webhook its decision was delivered to.
    expect(await getApproval(t.db, first)).toMatchObject({ webhookUrl: HOOK })
  })

  it('caps approvals per session and auto-denies beyond it without a new row', async () => {
    for (const n of [1, 2, 3]) await opened(`call-${n}`, `knowledge:${n}`)
    expect(await openApproval(SESSION, 'call-4', HOOK, { ...input, sourceId: 'knowledge:4' })).toEqual({ kind: 'capped' })
    expect((await state()).pendingApprovals).toHaveLength(3)
    // A source already asked about is still answered from its row, cap or not.
    expect((await openApproval(SESSION, 'call-5', HOOK, { ...input, sourceId: 'knowledge:1' })).kind).toBe('pending')
  })

  it('records a restricted category only from what this session’s search listed', async () => {
    await opened('call-1', 'knowledge:9')
    expect((await state()).restrictedCategoriesRequested).toEqual([])
    await putCachedSearch(t.db, SESSION, 'notice', {
      items: [],
      restricted: [{ sourceId: 'knowledge:5', topic: 'Notice period', category: 'availability' }],
    })
    await opened('call-2', 'knowledge:5')
    expect((await state()).restrictedCategoriesRequested).toEqual(['availability'])
    expect((await state()).toolsUsed).toContain('request_disclosure')
  })
})

describe('notifyOwner', () => {
  it('sends once and stores the message id; a retry after the send does not resend', async () => {
    const id = await opened('call-1')
    await notifyOwner(id, input)
    expect(await getApproval(t.db, id)).toMatchObject({ telegramMessageId: 501, webhookUrl: HOOK })
    await notifyOwner(id, input)
    expect(m.sendApprovalRequest).toHaveBeenCalledTimes(1)
  })
})

describe('finalizeApproval', () => {
  it('keeps the owner’s recorded decision', async () => {
    const id = await opened('call-1')
    await decideApproval(t.db, id, { status: 'approved', actor: 'telegram:42', reasoning: 'yes' })
    expect(await finalizeApproval(SESSION, id)).toBe('approved')
    expect(m.markDecided).not.toHaveBeenCalled()
    const s = await state()
    expect(s.pendingApprovals).toEqual([])
    expect(s.approvalDecisions).toMatchObject([{ approvalId: id, status: 'approved' }])
  })

  it('fails closed: a stray callback or the deadline with no decision expires it', async () => {
    const id = await opened('call-1')
    await setApprovalTelegramMessage(t.db, id, 501)
    expect(await finalizeApproval(SESSION, id)).toBe('expired')
    expect(await getApproval(t.db, id)).toMatchObject({ status: 'expired', actor: 'system' })
    expect(m.markDecided).toHaveBeenCalledWith(501, expect.stringMatching(/expired/i))
  })

  it('records one decision however often it runs, and retries the message edit from the row', async () => {
    const id = await opened('call-1')
    await setApprovalTelegramMessage(t.db, id, 501)
    m.markDecided.mockRejectedValueOnce(new Error('Telegram editMessageText failed: HTTP 502'))
    expect(await finalizeApproval(SESSION, id)).toBe('expired')
    expect(await finalizeApproval(SESSION, id)).toBe('expired')
    expect(m.markDecided).toHaveBeenCalledTimes(2)
    expect((await state()).approvalDecisions).toHaveLength(1)
  })
})
