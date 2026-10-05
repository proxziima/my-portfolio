import type { TwinItem } from '@repo/twin/contract'
import type { WorkflowToolContext } from 'eve/tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DisclosureInput, DisclosureOutcome } from '../agent/lib/approvals'

// The body runs uncompiled here: 'use workflow' is a plain string expression, `workflow` is
// mocked so the test owns the race between the owner's decision and the deadline, and the steps
// are mocked so only the body's own control flow is under test.
const m = vi.hoisted(() => {
  const deferred = <T>() => {
    let resolve!: (v: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return { promise, resolve }
  }
  return {
    deferred,
    webhook: deferred<unknown>(),
    deadline: deferred<void>(),
    sleep: vi.fn(),
    openApproval: vi.fn(),
    notifyOwner: vi.fn(),
    approvalTimeout: vi.fn(),
    finalizeApproval: vi.fn(),
    discloseItem: vi.fn(),
  }
})

vi.mock('workflow', () => ({
  // A thenable with a url, the shape the body awaits and races.
  createWebhook: () => ({ url: 'https://twin.test/webhook/w1', then: m.webhook.promise.then.bind(m.webhook.promise) }),
  sleep: m.sleep,
}))
vi.mock('../agent/lib/approvals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../agent/lib/approvals')>()),
  openApproval: m.openApproval,
  notifyOwner: m.notifyOwner,
  approvalTimeout: m.approvalTimeout,
  finalizeApproval: m.finalizeApproval,
  discloseItem: m.discloseItem,
}))
vi.mock('../agent/lib/env', () => ({ getEnv: () => ({ TWIN_PROMPT_CANARY: 'offline-canary-0123' }) }))

const { default: tool } = await import('../agent/tools/request_disclosure')

const input: DisclosureInput = { sourceId: 'knowledge:9', reason: 'visitor asked' }
const item: TwinItem = { sourceId: 'knowledge:9', kind: 'knowledge', title: 'Notice period', text: 'Thirty days' }
const ctx = { session: { id: 'sess1' }, callId: 'call1' } as unknown as WorkflowToolContext

/** The real body, called directly; a `task` tool returns one outcome, never a stream. */
const run = () => tool.task(input, ctx) as Promise<DisclosureOutcome>

beforeEach(() => {
  vi.clearAllMocks()
  m.webhook = m.deferred<unknown>()
  m.deadline = m.deferred<void>()
  m.sleep.mockImplementation(() => m.deadline.promise)
  m.openApproval.mockResolvedValue({ kind: 'pending', approvalId: 'a1' })
  m.notifyOwner.mockResolvedValue(undefined)
  m.approvalTimeout.mockResolvedValue('3s')
  m.discloseItem.mockResolvedValue(item)
})

describe('request_disclosure workflow body', () => {
  it('opens the approval against the webhook url and sleeps for the configured deadline', async () => {
    m.finalizeApproval.mockResolvedValue('expired')
    m.deadline.resolve()
    await run()
    expect(m.openApproval).toHaveBeenCalledWith('sess1', 'call1', 'https://twin.test/webhook/w1', input)
    expect(m.notifyOwner).toHaveBeenCalledWith('a1')
    expect(m.sleep).toHaveBeenCalledWith('3s')
  })

  it('times out to expired when the owner never answers', async () => {
    m.finalizeApproval.mockResolvedValue('expired')
    m.deadline.resolve()
    await expect(run()).resolves.toEqual({ status: 'expired' })
    expect(m.finalizeApproval).toHaveBeenCalledWith('sess1', 'a1')
    expect(m.discloseItem).not.toHaveBeenCalled()
  })

  it('releases the item when the owner approves before the deadline', async () => {
    m.finalizeApproval.mockResolvedValue('approved')
    m.webhook.resolve({})
    await expect(run()).resolves.toEqual({ status: 'approved', item })
    expect(m.finalizeApproval).toHaveBeenCalledWith('sess1', 'a1')
    expect(m.discloseItem).toHaveBeenCalledWith('knowledge:9')
  })

  it('returns denied without disclosing when the owner denies', async () => {
    m.finalizeApproval.mockResolvedValue('denied')
    m.webhook.resolve({})
    await expect(run()).resolves.toEqual({ status: 'denied' })
    expect(m.discloseItem).not.toHaveBeenCalled()
  })

  it('expires the approval when the owner cannot be notified', async () => {
    m.notifyOwner.mockRejectedValue(new Error('photon down'))
    m.finalizeApproval.mockResolvedValue('expired')
    await expect(run()).resolves.toEqual({ status: 'expired' })
    expect(m.finalizeApproval).toHaveBeenCalledWith('sess1', 'a1')
    expect(m.sleep).not.toHaveBeenCalled()
  })

  it('reads a failed release as denied', async () => {
    m.finalizeApproval.mockResolvedValue('approved')
    m.discloseItem.mockRejectedValue(new Error('cms down'))
    m.webhook.resolve({})
    await expect(run()).resolves.toEqual({ status: 'denied' })
  })

  it('denies at the session cap without notifying anyone', async () => {
    m.openApproval.mockResolvedValue({ kind: 'capped' })
    await expect(run()).resolves.toEqual({ status: 'denied' })
    expect(m.notifyOwner).not.toHaveBeenCalled()
    expect(m.finalizeApproval).not.toHaveBeenCalled()
  })

  it('denies an item this session was never offered without notifying anyone', async () => {
    m.openApproval.mockResolvedValue({ kind: 'notOffered' })
    await expect(run()).resolves.toEqual({ status: 'denied' })
    expect(m.notifyOwner).not.toHaveBeenCalled()
    expect(m.sleep).not.toHaveBeenCalled()
    expect(m.finalizeApproval).not.toHaveBeenCalled()
    expect(m.discloseItem).not.toHaveBeenCalled()
  })

  it.each(['denied', 'expired'] as const)('reuses an earlier %s decision without notifying', async (status) => {
    m.openApproval.mockResolvedValue({ kind: 'alreadyDecided', approvalId: 'a0', status })
    await expect(run()).resolves.toEqual({ status })
    expect(m.notifyOwner).not.toHaveBeenCalled()
    expect(m.sleep).not.toHaveBeenCalled()
    expect(m.discloseItem).not.toHaveBeenCalled()
  })

  it('releases an item approved earlier without notifying', async () => {
    m.openApproval.mockResolvedValue({ kind: 'alreadyDecided', approvalId: 'a0', status: 'approved' })
    await expect(run()).resolves.toEqual({ status: 'approved', item })
    expect(m.notifyOwner).not.toHaveBeenCalled()
  })

  it.each(['denied', 'expired'] as const)('tells the model a %s item is unavailable without revealing a check', (status) => {
    const out = tool.toModelOutput?.({ status } as never)
    const text = JSON.stringify(out)
    expect(text).toMatch(/not available/i)
    // The only mention of checking is the instruction never to mention it.
    expect(text).toMatch(/never mention that you checked/i)
    expect(text).not.toMatch(/owner|approv|denied|expired|imessage|photon/i)
  })
})
