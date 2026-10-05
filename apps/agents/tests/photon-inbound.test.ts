import type { PhotonInboundMessageContext } from 'eve/channels/photon'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { helpText } from '../agent/lib/imessage-reply'
import type { PhotonMessage } from '../agent/lib/photon-inbound'

const OWNER = '+5511999998888'
const IMESSAGE_ENV = {
  IMESSAGE_PROJECT_ID: 'photon-project-1',
  IMESSAGE_PROJECT_SECRET: 'photon-secret-VALUE',
  IMESSAGE_WEBHOOK_SECRET: 'photon-webhook-VALUE',
  OWNER_PHONE_NUMBER: OWNER,
}

const m = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  post: vi.fn(),
  deliver: vi.fn(),
  findApprovalByCode: vi.fn(),
  listPendingApprovals: vi.fn(),
  decideApproval: vi.fn(),
  getApproval: vi.fn(),
}))

vi.mock('../agent/lib/env', () => ({ getEnv: () => m.env }))
vi.mock('../agent/lib/db', () => ({ db: () => ({}) }))
vi.mock('@repo/twin/db', () => ({
  findApprovalByCode: m.findApprovalByCode,
  listPendingApprovals: m.listPendingApprovals,
  decideApproval: m.decideApproval,
  getApproval: m.getApproval,
}))
vi.mock('../agent/lib/webhook-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../agent/lib/webhook-utils')>()),
  deliver: m.deliver,
}))

import { RESEND_TEXT, handleOwnerMessage } from '../agent/lib/photon-inbound'

const ctx = (isDM = true) => ({ thread: { isDM, post: m.post } }) as unknown as PhotonInboundMessageContext
const msg = (text: string, from = OWNER, author: { isBot?: boolean; isMe?: boolean } = {}) =>
  ({
    text,
    author: { userId: from, userName: from, fullName: from, isBot: author.isBot ?? false, isMe: author.isMe ?? false },
  }) as unknown as PhotonMessage

const pending = {
  id: 'ap-1',
  sessionId: 's1',
  sourceId: 'knowledge:5',
  topic: 'Notice period',
  status: 'pending',
  webhookUrl: 'https://hook',
  replyCode: 'K7Q2',
  notifiedAt: new Date('2026-10-05T10:00:00Z'),
  decidedAt: null,
  actor: null,
}

const noDatabaseCalls = () => {
  for (const fn of [m.findApprovalByCode, m.listPendingApprovals, m.decideApproval, m.getApproval])
    expect(fn).not.toHaveBeenCalled()
}

const spies = (['warn', 'error', 'log', 'info'] as const).map((k) => vi.spyOn(console, k))

beforeEach(() => {
  vi.resetAllMocks()
  for (const spy of spies) spy.mockImplementation(() => {})
  m.env = IMESSAGE_ENV
  m.post.mockResolvedValue(undefined)
  m.listPendingApprovals.mockResolvedValue([])
})

describe('handleOwnerMessage', () => {
  it('ignores everything while iMessage is not configured', async () => {
    m.env = {}
    expect(await handleOwnerMessage(ctx(), msg('YES K7Q2'))).toBeNull()
    noDatabaseCalls()
    expect(m.post).not.toHaveBeenCalled()
  })

  it.each([
    ['a bot', msg('YES K7Q2', OWNER, { isBot: true }), true],
    ['our own message', msg('YES K7Q2', OWNER, { isMe: true }), true],
    ['a group message', msg('YES K7Q2'), false],
  ])('ignores %s', async (_label, message, isDM) => {
    expect(await handleOwnerMessage(ctx(isDM), message)).toBeNull()
    noDatabaseCalls()
    expect(m.post).not.toHaveBeenCalled()
  })

  it.each(['+15551112222', 'owner@icloud.com'])('never answers a stranger (%s), and never logs the handle', async (from) => {
    expect(await handleOwnerMessage(ctx(), msg('YES K7Q2', from))).toBeNull()
    noDatabaseCalls()
    expect(m.post).not.toHaveBeenCalled()
    const logged = spies.flatMap((s) => s.mock.calls.flat().map(String)).join('\n')
    expect(logged).not.toContain(from)
  })

  it.each(['', '   '])('never answers an owner event with no text (%j), which would loop on receipts', async (text) => {
    m.listPendingApprovals.mockResolvedValue([pending])
    expect(await handleOwnerMessage(ctx(), msg(text))).toBeNull()
    noDatabaseCalls()
    expect(m.post).not.toHaveBeenCalled()
  })

  it('accepts the owner number written another way', async () => {
    m.findApprovalByCode.mockResolvedValue(pending)
    m.decideApproval.mockResolvedValue({ ...pending, status: 'approved', decidedAt: new Date() })
    await handleOwnerMessage(ctx(), msg('YES K7Q2', '+55 11 99999-8888'))
    expect(m.decideApproval).toHaveBeenCalled()
  })

  it('approves by code, wakes the workflow and confirms', async () => {
    m.findApprovalByCode.mockResolvedValue(pending)
    m.decideApproval.mockResolvedValue({ ...pending, status: 'approved', decidedAt: new Date() })
    expect(await handleOwnerMessage(ctx(), msg('YES K7Q2'))).toBeNull()
    expect(m.findApprovalByCode).toHaveBeenCalledWith(expect.anything(), 'K7Q2')
    expect(m.decideApproval).toHaveBeenCalledWith(expect.anything(), 'ap-1', {
      status: 'approved',
      actor: 'imessage:owner',
      reasoning: 'Approved via iMessage',
    })
    expect(m.deliver).toHaveBeenCalledWith('https://hook', 'ap-1', 'approved')
    expect(m.post).toHaveBeenCalledWith('Approved K7Q2: Notice period.')
  })

  it('denies by code', async () => {
    m.findApprovalByCode.mockResolvedValue(pending)
    m.decideApproval.mockResolvedValue({ ...pending, status: 'denied', decidedAt: new Date() })
    await handleOwnerMessage(ctx(), msg('no k7q2'))
    expect(m.decideApproval).toHaveBeenCalledWith(expect.anything(), 'ap-1', expect.objectContaining({ status: 'denied', reasoning: 'Denied via iMessage' }))
    expect(m.post).toHaveBeenCalledWith('Denied K7Q2: Notice period. Nothing was shared.')
  })

  it('tells a late reply what happened and delivers nothing', async () => {
    m.findApprovalByCode.mockResolvedValue(pending)
    m.decideApproval.mockResolvedValue(null)
    m.getApproval.mockResolvedValue({ ...pending, status: 'expired', actor: 'system' })
    await handleOwnerMessage(ctx(), msg('YES K7Q2'))
    expect(m.deliver).not.toHaveBeenCalled()
    expect(m.post).toHaveBeenCalledWith('K7Q2 already expired; nothing was shared.')
  })

  it('re-delivers and re-confirms a repeated decision by the owner', async () => {
    m.findApprovalByCode.mockResolvedValue(pending)
    m.decideApproval.mockResolvedValue(null)
    m.getApproval.mockResolvedValue({ ...pending, status: 'approved', actor: 'imessage:owner' })
    await handleOwnerMessage(ctx(), msg('YES K7Q2'))
    expect(m.deliver).toHaveBeenCalledWith('https://hook', 'ap-1', 'approved')
    expect(m.post).toHaveBeenCalledWith('Approved K7Q2: Notice period.')
  })

  it('answers an unknown code', async () => {
    m.findApprovalByCode.mockResolvedValue(null)
    await handleOwnerMessage(ctx(), msg('YES ZZZZ'))
    expect(m.decideApproval).not.toHaveBeenCalled()
    expect(m.post).toHaveBeenCalledWith('No approval ZZZZ is waiting.')
  })

  it('never decides on a bare reply, even with exactly one approval waiting', async () => {
    m.listPendingApprovals.mockResolvedValue([pending])
    await handleOwnerMessage(ctx(), msg('yes'))
    expect(m.decideApproval).not.toHaveBeenCalled()
    expect(m.post).toHaveBeenCalledWith(helpText([pending]))
  })

  it('lists only the notified approvals in the help text', async () => {
    const unnotified = { ...pending, id: 'ap-2', replyCode: 'M3NP', notifiedAt: null }
    m.listPendingApprovals.mockResolvedValue([pending, unnotified])
    await handleOwnerMessage(ctx(), msg('maybe'))
    expect(m.post).toHaveBeenCalledWith(helpText([pending]))
  })

  it('keeps the decision when the confirmation fails to send', async () => {
    m.findApprovalByCode.mockResolvedValue(pending)
    m.decideApproval.mockResolvedValue({ ...pending, status: 'approved', decidedAt: new Date() })
    m.post.mockRejectedValue(new Error('photon down'))
    expect(await handleOwnerMessage(ctx(), msg('YES K7Q2'))).toBeNull()
    expect(m.decideApproval).toHaveBeenCalled()
    expect(m.deliver).toHaveBeenCalled()
  })

  it('asks the owner to resend when the database fails, without throwing', async () => {
    m.findApprovalByCode.mockRejectedValue(new Error('db down'))
    expect(await handleOwnerMessage(ctx(), msg('YES K7Q2'))).toBeNull()
    expect(m.post).toHaveBeenCalledWith(RESEND_TEXT)
  })
})
