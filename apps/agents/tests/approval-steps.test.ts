import {
  createConversation,
  createVisitor,
  decideApproval,
  findSessionApproval,
  getApproval,
  getConversation,
  putCachedSearch,
  setApprovalNotified,
} from '@repo/twin/db'
import { createTestDb, type TestDb } from '@repo/twin/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  db: null as unknown,
  sendToOwner: vi.fn(async (): Promise<string | null> => 'h-1'),
}))
vi.mock('../agent/lib/db', () => ({ db: () => m.db }))
vi.mock('../agent/lib/env', () => ({ getEnv: () => ({ TWIN_APPROVAL_TIMEOUT: '15m' }) }))
vi.mock('../agent/lib/payload-mcp', () => ({ callPayloadTool: vi.fn() }))
vi.mock('../agent/lib/imessage', () => ({ sendToOwner: m.sendToOwner }))

const { finalizeApproval, notifyOwner, openApproval } = await import('../agent/lib/approvals')

const SESSION = 'sess-1'
const HOOK = 'https://agents.test/.well-known/workflow/v1/webhook/tok-1'
const HOOK_2 = 'https://agents.test/.well-known/workflow/v1/webhook/tok-2'
const HOOK_3 = 'https://agents.test/.well-known/workflow/v1/webhook/tok-3'
const input = { sourceId: 'knowledge:5', reason: 'Recruiter asked when I can start' }
/** What this session's searches offered as restricted: the CMS's own topics. */
const OFFERED = [1, 2, 3, 4, 5].map((n) => ({ sourceId: `knowledge:${n}`, topic: `CMS topic ${n}`, category: n === 5 ? ('availability' as const) : null }))

let t: TestDb
beforeEach(async () => {
  t = await createTestDb()
  m.db = t.db
  m.sendToOwner.mockReset().mockResolvedValue('h-1')
  await createConversation(t.db, SESSION, await createVisitor(t.db))
  await putCachedSearch(t.db, SESSION, 'offered', { items: [], restricted: OFFERED })
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
    expect((await state()).pendingApprovals).toEqual([{ approvalId: first, sourceId: 'knowledge:5', topic: 'CMS topic 5' }])
    expect(await getApproval(t.db, first)).toMatchObject({ webhookUrl: HOOK, notifiedAt: null })
  })

  it('reuses a pending approval for the same source instead of asking the owner again', async () => {
    const first = await opened('call-1')
    expect(await opened('call-2')).toBe(first)
    await notifyOwner(first)
    await notifyOwner(first)
    expect(m.sendToOwner).toHaveBeenCalledTimes(1)
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
    await decideApproval(t.db, first, { status: 'denied', actor: 'imessage:owner', reasoning: 'no' })
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

  it('records the restricted category and stores the CMS stub topic, not the model’s', async () => {
    const id = await opened('call-1', 'knowledge:5')
    expect((await state()).restrictedCategoriesRequested).toEqual(['availability'])
    expect((await state()).toolsUsed).toContain('request_disclosure')
    expect(await getApproval(t.db, id)).toMatchObject({ topic: 'CMS topic 5' })
  })

  it('refuses an item this session was never offered as restricted: no row, no state change', async () => {
    const before = await state()
    expect(await openApproval(SESSION, 'call-1', HOOK, { ...input, sourceId: 'knowledge:99' })).toEqual({ kind: 'notOffered' })
    // A public item listed by a search is not a restricted stub either.
    await putCachedSearch(t.db, SESSION, 'public', { items: [{ sourceId: 'projects:7', kind: 'project', title: 'Atlas', text: 'x' }], restricted: [] })
    expect(await openApproval(SESSION, 'call-2', HOOK, { ...input, sourceId: 'projects:7' })).toEqual({ kind: 'notOffered' })
    expect(await findSessionApproval(t.db, SESSION, { sourceId: 'knowledge:99' })).toBeNull()
    expect(await state()).toEqual(before)
  })
})

describe('notifyOwner', () => {
  it('texts once and stamps notified_at; a repeat on a notified approval sends nothing', async () => {
    const id = await opened('call-1')
    await notifyOwner(id)
    expect(await getApproval(t.db, id)).toMatchObject({ notifiedAt: expect.any(Date), webhookUrl: HOOK })
    await notifyOwner(id)
    expect(m.sendToOwner).toHaveBeenCalledTimes(1)
  })

  it('does not text an approval that is already notified', async () => {
    const id = await opened('call-1')
    await setApprovalNotified(t.db, id)
    await notifyOwner(id)
    expect(m.sendToOwner).not.toHaveBeenCalled()
  })

  it('leaves notified_at unset when the send fails, so a retry texts again', async () => {
    const id = await opened('call-1')
    m.sendToOwner.mockRejectedValueOnce(new Error('sendblue down'))
    await expect(notifyOwner(id)).rejects.toThrow('sendblue down')
    expect(await getApproval(t.db, id)).toMatchObject({ notifiedAt: null })
    await notifyOwner(id)
    expect(m.sendToOwner).toHaveBeenCalledTimes(2)
  })

  it('texts the request with its reply code, built from the CMS topic and item, never the visitor-steerable reason', async () => {
    const id = await opened('call-1')
    await notifyOwner(id)
    const row = (await getApproval(t.db, id))!
    expect(row.replyCode).toMatch(/^[A-Z0-9]{4}$/)
    expect(m.sendToOwner).toHaveBeenCalledTimes(1)
    expect(m.sendToOwner).toHaveBeenCalledWith(
      `Twin approval request\nTopic: CMS topic 5\nItem: knowledge:5\nReply YES ${row.replyCode} to share or NO ${row.replyCode} to decline. Auto-denies after 15m.`,
    )
    const [text] = m.sendToOwner.mock.calls[0] as unknown as [string]
    expect(text).not.toContain(input.reason)
  })

  it('sends nothing for an approval that was decided before it was notified', async () => {
    const id = await opened('call-1')
    await decideApproval(t.db, id, { status: 'approved', actor: 'imessage:owner', reasoning: 'yes' })
    await notifyOwner(id)
    expect(m.sendToOwner).not.toHaveBeenCalled()
    expect(await getApproval(t.db, id)).toMatchObject({ notifiedAt: null })
  })
})

describe('finalizeApproval', () => {
  it('keeps the owner’s recorded decision', async () => {
    const id = await opened('call-1')
    await decideApproval(t.db, id, { status: 'approved', actor: 'imessage:owner', reasoning: 'yes' })
    expect(await finalizeApproval(SESSION, id)).toBe('approved')
    const s = await state()
    expect(s.pendingApprovals).toEqual([])
    expect(s.approvalDecisions).toMatchObject([{ approvalId: id, status: 'approved' }])
  })

  it('fails closed: a stray POST or the deadline with no decision expires it, without texting the owner', async () => {
    const id = await opened('call-1')
    await setApprovalNotified(t.db, id)
    expect(await finalizeApproval(SESSION, id)).toBe('expired')
    expect(await getApproval(t.db, id)).toMatchObject({ status: 'expired', actor: 'system' })
    expect(m.sendToOwner).not.toHaveBeenCalled()
  })

  it('records one decision however often it runs', async () => {
    const id = await opened('call-1')
    expect(await finalizeApproval(SESSION, id)).toBe('expired')
    expect(await finalizeApproval(SESSION, id)).toBe('expired')
    expect((await state()).approvalDecisions).toHaveLength(1)
  })
})
