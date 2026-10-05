import { beforeEach, describe, expect, it, vi } from 'vitest'
import { helpText } from '../agent/lib/imessage-reply'

const SECRET = 'sb_secret_value_1234'
const OWNER = '+5511999998888'

const IMESSAGE_ENV = {
  SENDBLUE_API_BASE: 'https://sb.test',
  SENDBLUE_API_KEY: 'key_value_1234',
  SENDBLUE_API_SECRET: 'secret_value_1234',
  SENDBLUE_FROM_NUMBER: '+15550000001',
  SENDBLUE_WEBHOOK_SECRET: SECRET,
  OWNER_PHONE_NUMBER: OWNER,
}

const m = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  send: vi.fn(),
  deliver: vi.fn(),
  findApprovalByCode: vi.fn(),
  listPendingApprovals: vi.fn(),
  decideApproval: vi.fn(),
  getApproval: vi.fn(),
}))

vi.mock('../agent/lib/env', () => ({ getEnv: () => m.env }))
vi.mock('../agent/lib/db', () => ({ db: () => ({}) }))
vi.mock('../agent/lib/imessage', () => ({ sendToOwner: m.send }))
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

import { handleSendblueWebhook } from '../agent/lib/sendblue-webhook'

const req = (body: unknown, secret: string | null = SECRET) =>
  new Request('http://agents/webhooks/sendblue', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret ? { 'sb-signing-secret': secret } : {}) },
    body: JSON.stringify(body),
  })

const NOTIFIED_AT = new Date('2026-10-05T10:00:00Z')
const SENT_AT = '2026-10-05T10:01:00Z'

const inbound = (content: string | null, from = OWNER, dateSent: string | null = SENT_AT) => ({
  content,
  from_number: from,
  to_number: '+15550000001',
  is_outbound: false,
  status: 'RECEIVED',
  message_handle: 'h-in',
  service: 'iMessage',
  ...(dateSent ? { date_sent: dateSent } : {}),
})

const pending = {
  id: 'ap-1',
  sessionId: 's1',
  sourceId: 'knowledge:5',
  topic: 'Notice period',
  status: 'pending',
  webhookUrl: 'https://hook',
  replyCode: 'K7Q2',
  notifiedAt: NOTIFIED_AT,
  decidedAt: null,
  actor: null,
}

const noDatabaseCalls = () => {
  expect(m.findApprovalByCode).not.toHaveBeenCalled()
  expect(m.listPendingApprovals).not.toHaveBeenCalled()
  expect(m.decideApproval).not.toHaveBeenCalled()
  expect(m.getApproval).not.toHaveBeenCalled()
}

const warn = vi.spyOn(console, 'warn')
const error = vi.spyOn(console, 'error')
const log = vi.spyOn(console, 'log')
const info = vi.spyOn(console, 'info')

beforeEach(() => {
  vi.resetAllMocks()
  for (const spy of [warn, error, log, info]) spy.mockImplementation(() => {})
  m.env = IMESSAGE_ENV
  m.send.mockResolvedValue('h-out')
  m.deliver.mockResolvedValue(undefined)
})

describe('handleSendblueWebhook', () => {
  it('is a 404 when the integration is off', async () => {
    m.env = {}
    const res = await handleSendblueWebhook(req(inbound('YES K7Q2')))
    expect(res.status).toBe(404)
    noDatabaseCalls()
    expect(m.send).not.toHaveBeenCalled()
    expect(m.deliver).not.toHaveBeenCalled()
  })

  it('rejects a wrong or missing secret', async () => {
    expect((await handleSendblueWebhook(req(inbound('YES K7Q2'), 'wrong'))).status).toBe(401)
    expect((await handleSendblueWebhook(req(inbound('YES K7Q2'), null))).status).toBe(401)
    noDatabaseCalls()
    expect(m.send).not.toHaveBeenCalled()
    expect(m.deliver).not.toHaveBeenCalled()
  })

  it('acknowledges a body that is not the inbound shape without touching the database', async () => {
    const res = await handleSendblueWebhook(req({ hello: 1 }))
    expect(res.status).toBe(200)
    noDatabaseCalls()
    expect(m.send).not.toHaveBeenCalled()
  })

  it.each([
    ['an outbound message', { is_outbound: true }],
    ['a non-RECEIVED status', { status: 'SENT' }],
    ['a group message', { group_id: 'g1' }],
  ])('ignores %s', async (_name, patch) => {
    const res = await handleSendblueWebhook(req({ ...inbound('YES K7Q2'), ...patch }))
    expect(res.status).toBe(200)
    noDatabaseCalls()
    expect(m.send).not.toHaveBeenCalled()
  })

  it.each(['+15551112222', 'owner@icloud.com'])('ignores another sender (%s) and never logs it', async (from) => {
    const res = await handleSendblueWebhook(req(inbound('YES K7Q2', from)))
    expect(res.status).toBe(200)
    noDatabaseCalls()
    expect(m.send).not.toHaveBeenCalled()
    const logged = [warn, error, log, info].flatMap((spy) => spy.mock.calls.flat()).join(' ')
    expect(logged).not.toContain(from)
    expect(logged).not.toContain('15551112222')
  })

  it("accepts the owner's number in another format", async () => {
    m.findApprovalByCode.mockResolvedValue(null)
    const res = await handleSendblueWebhook(req(inbound('YES ZZZZ', '+55 11 99999-8888')))
    expect(res.status).toBe(200)
    expect(m.findApprovalByCode).toHaveBeenCalledWith(expect.anything(), 'ZZZZ')
  })

  it('records an approval, wakes the workflow and confirms', async () => {
    m.findApprovalByCode.mockResolvedValue(pending)
    m.decideApproval.mockResolvedValue({ ...pending, status: 'approved', decidedAt: new Date() })
    const res = await handleSendblueWebhook(req(inbound('YES K7Q2')))
    expect(res.status).toBe(200)
    expect(m.findApprovalByCode).toHaveBeenCalledWith(expect.anything(), 'K7Q2')
    expect(m.decideApproval).toHaveBeenCalledWith(expect.anything(), 'ap-1', {
      status: 'approved',
      actor: 'imessage:owner',
      reasoning: 'Approved via iMessage',
    })
    expect(m.deliver).toHaveBeenCalledWith('https://hook', 'ap-1', 'approved')
    expect(m.send).toHaveBeenCalledWith('Approved K7Q2: Notice period.')
  })

  it('records a denial (code is case-insensitive)', async () => {
    m.findApprovalByCode.mockResolvedValue(pending)
    m.decideApproval.mockResolvedValue({ ...pending, status: 'denied', decidedAt: new Date() })
    await handleSendblueWebhook(req(inbound('no k7q2')))
    expect(m.decideApproval).toHaveBeenCalledWith(expect.anything(), 'ap-1', {
      status: 'denied',
      actor: 'imessage:owner',
      reasoning: 'Denied via iMessage',
    })
    expect(m.deliver).toHaveBeenCalledWith('https://hook', 'ap-1', 'denied')
    expect(m.send).toHaveBeenCalledWith('Denied K7Q2: Notice period. Nothing was shared.')
  })

  it('answers a late reply without delivering', async () => {
    m.findApprovalByCode.mockResolvedValue(pending)
    m.decideApproval.mockResolvedValue(null)
    m.getApproval.mockResolvedValue({ ...pending, status: 'expired', actor: 'system' })
    const res = await handleSendblueWebhook(req(inbound('YES K7Q2')))
    expect(res.status).toBe(200)
    expect(m.deliver).not.toHaveBeenCalled()
    expect(m.send).toHaveBeenCalledWith('K7Q2 already expired; nothing was shared.')
  })

  it('re-delivers a redelivery of the same decision by the owner', async () => {
    m.findApprovalByCode.mockResolvedValue(pending)
    m.decideApproval.mockResolvedValue(null)
    m.getApproval.mockResolvedValue({ ...pending, status: 'approved', actor: 'imessage:owner' })
    await handleSendblueWebhook(req(inbound('YES K7Q2')))
    expect(m.deliver).toHaveBeenCalledWith('https://hook', 'ap-1', 'approved')
    expect(m.send).toHaveBeenCalledWith('Approved K7Q2: Notice period.')
  })

  it('tells the owner when a code matches nothing', async () => {
    m.findApprovalByCode.mockResolvedValue(null)
    await handleSendblueWebhook(req(inbound('YES ZZZZ')))
    expect(m.decideApproval).not.toHaveBeenCalled()
    expect(m.send).toHaveBeenCalledWith('No approval ZZZZ is waiting.')
  })

  it('decides the only waiting approval for a bare yes', async () => {
    m.listPendingApprovals.mockResolvedValue([pending])
    m.decideApproval.mockResolvedValue({ ...pending, status: 'approved', decidedAt: new Date() })
    await handleSendblueWebhook(req(inbound('yes')))
    expect(m.findApprovalByCode).not.toHaveBeenCalled()
    expect(m.decideApproval).toHaveBeenCalledWith(expect.anything(), 'ap-1', expect.objectContaining({ status: 'approved' }))
    expect(m.send).toHaveBeenCalledWith('Approved K7Q2: Notice period.')
  })

  it('lists the waiting approvals instead of guessing for a bare yes', async () => {
    const other = { ...pending, id: 'ap-2', replyCode: 'M3X9', topic: 'Salary' }
    m.listPendingApprovals.mockResolvedValue([pending, other])
    await handleSendblueWebhook(req(inbound('yes')))
    expect(m.decideApproval).not.toHaveBeenCalled()
    expect(m.send).toHaveBeenCalledWith(helpText([pending, other]))
  })

  it('answers anything unrecognised with the help text', async () => {
    m.listPendingApprovals.mockResolvedValue([pending])
    await handleSendblueWebhook(req(inbound('maybe')))
    expect(m.decideApproval).not.toHaveBeenCalled()
    expect(m.send).toHaveBeenCalledWith(helpText([pending]))
  })

  it.each([null, ''])('answers empty content (%j) with the help text', async (content) => {
    m.listPendingApprovals.mockResolvedValue([pending])
    const res = await handleSendblueWebhook(req(inbound(content)))
    expect(res.status).toBe(200)
    expect(m.decideApproval).not.toHaveBeenCalled()
    expect(m.send).toHaveBeenCalledWith(helpText([pending]))
  })

  it('refuses a bare yes sent before the prompt was notified (a redelivery of an older reply)', async () => {
    m.listPendingApprovals.mockResolvedValue([pending])
    await handleSendblueWebhook(req(inbound('yes', OWNER, '2026-10-05T09:59:00Z')))
    expect(m.decideApproval).not.toHaveBeenCalled()
    expect(m.deliver).not.toHaveBeenCalled()
    expect(m.send).toHaveBeenCalledWith(helpText([pending]))
  })

  it('refuses a bare yes when another approval is pending but not yet notified', async () => {
    const racing = { ...pending, id: 'ap-2', replyCode: 'M3X9', topic: 'Salary', notifiedAt: null }
    m.listPendingApprovals.mockResolvedValue([pending, racing])
    await handleSendblueWebhook(req(inbound('yes')))
    expect(m.decideApproval).not.toHaveBeenCalled()
    expect(m.send).toHaveBeenCalledWith(helpText([pending]))
  })

  it('refuses a bare yes without a send date', async () => {
    m.listPendingApprovals.mockResolvedValue([pending])
    await handleSendblueWebhook(req(inbound('yes', OWNER, null)))
    expect(m.decideApproval).not.toHaveBeenCalled()
    expect(m.send).toHaveBeenCalledWith(helpText([pending]))
  })

  it('refuses a bare yes with an unparseable send date', async () => {
    m.listPendingApprovals.mockResolvedValue([pending])
    await handleSendblueWebhook(req(inbound('yes', OWNER, 'not a date')))
    expect(m.decideApproval).not.toHaveBeenCalled()
    expect(m.send).toHaveBeenCalledWith(helpText([pending]))
  })

  it('refuses a bare yes when the only pending approval was never notified', async () => {
    m.listPendingApprovals.mockResolvedValue([{ ...pending, notifiedAt: null }])
    await handleSendblueWebhook(req(inbound('yes')))
    expect(m.decideApproval).not.toHaveBeenCalled()
    expect(m.send).toHaveBeenCalledWith('Nothing is waiting for approval.')
  })

  it('still decides a coded reply without a send date', async () => {
    m.findApprovalByCode.mockResolvedValue(pending)
    m.decideApproval.mockResolvedValue({ ...pending, status: 'approved', decidedAt: new Date() })
    await handleSendblueWebhook(req(inbound('YES K7Q2', OWNER, null)))
    expect(m.decideApproval).toHaveBeenCalledTimes(1)
    expect(m.send).toHaveBeenCalledWith('Approved K7Q2: Notice period.')
  })

  it('still acknowledges, with the decision committed, when the reply fails to send', async () => {
    m.findApprovalByCode.mockResolvedValue(pending)
    m.decideApproval.mockResolvedValue({ ...pending, status: 'approved', decidedAt: new Date() })
    m.send.mockRejectedValue(new Error('Sendblue send failed: HTTP 500'))
    const res = await handleSendblueWebhook(req(inbound('YES K7Q2')))
    expect(res.status).toBe(200)
    expect(m.decideApproval).toHaveBeenCalledTimes(1)
    expect(m.deliver).toHaveBeenCalledWith('https://hook', 'ap-1', 'approved')
  })

  it('rejects when the database fails, so Sendblue redelivers', async () => {
    m.findApprovalByCode.mockResolvedValue(pending)
    m.decideApproval.mockRejectedValue(new Error('db down'))
    await expect(handleSendblueWebhook(req(inbound('YES K7Q2')))).rejects.toThrow()
    expect(m.deliver).not.toHaveBeenCalled()
  })
})
