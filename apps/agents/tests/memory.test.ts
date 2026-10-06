import { beforeEach, describe, expect, it, vi } from 'vitest'

const twin = vi.hoisted(() => ({ recallVisitorHistory: vi.fn(), updateConversation: vi.fn() }))
const conv = vi.hoisted(() => ({ ensureConversation: vi.fn() }))
vi.mock('@repo/twin/db', () => twin)
vi.mock('../agent/lib/conversation', () => conv)
vi.mock('../agent/lib/db', () => ({ db: () => ({}) }))
vi.mock('../agent/lib/untrusted', () => ({
  untrustedKey: () => 'k'.repeat(20),
  untrusted: (s: string, c: string, k: string) => `<untrusted source="${s}" nonce="${k.slice(0, 4)}">\n${c}\n</untrusted>`,
}))

const { recallText } = await import('../agent/lib/memory')
const { default: slot } = await import('../agent/memory/visitor')
type Recall = (ctx: unknown) => Promise<{ messages: { id: string; content: string }[] } | null>
const recall = slot.provider.recall['turn.started'] as unknown as Recall

const VISITOR = '11111111-1111-4111-8111-111111111111'
const ctxOf = (principal: unknown) => ({ session: { id: 's1', auth: { current: principal } } })
const web = { principalType: 'user', principalId: `web:${VISITOR}`, authenticator: 'jwt', attributes: {} }
const history = { visits: 2, name: 'Ana', company: undefined, role: undefined, kind: undefined, topics: [], booked: false, declinedCall: false }

beforeEach(() => vi.clearAllMocks())

describe('recallText', () => {
  it('summarises earlier visits as untrusted data without raw history', () => {
    const out = recallText({ visits: 2, name: 'Ana', company: 'Acme', role: undefined, kind: 'recruiter', topics: ['project'], booked: false, declinedCall: true }, 'k'.repeat(20))
    expect(out).toMatch(/<untrusted source="memory"/)
    expect(out).toContain('2 earlier visits')
    expect(out).toContain('declined a call before')
  })

  it('uses the singular for one visit', () => {
    expect(recallText({ ...history, visits: 1 }, 'k'.repeat(20))).toContain('1 earlier visit\n')
  })
})

describe('visitor memory slot', () => {
  it('recalls nothing for non-visitor principals', async () => {
    expect(await recall(ctxOf({ ...web, principalId: 'service:x' }))).toBeNull()
    expect(twin.recallVisitorHistory).not.toHaveBeenCalled()
  })

  it('recalls nothing for a first-time visitor', async () => {
    twin.recallVisitorHistory.mockResolvedValueOnce(null)
    expect(await recall(ctxOf(web))).toBeNull()
    expect(twin.updateConversation).not.toHaveBeenCalled()
  })

  it('returns the note and flags the conversation, idempotently', async () => {
    twin.recallVisitorHistory.mockResolvedValueOnce(history)
    const out = await recall(ctxOf(web))
    expect(out?.messages[0]).toMatchObject({ id: 'returning-visitor' })
    expect(out?.messages[0]?.content).toContain('name: Ana')
    expect(twin.recallVisitorHistory).toHaveBeenCalledWith({}, VISITOR, 's1')
    expect(conv.ensureConversation).toHaveBeenCalledWith('s1', web)
    const update = twin.updateConversation.mock.calls[0]![2] as (s: { returningVisitor: boolean }) => unknown
    const already = { returningVisitor: true }
    expect(update(already)).toBe(already)
    expect(update({ returningVisitor: false })).toEqual({ returningVisitor: true })
  })

  it('logs and rethrows when the database fails, failing the turn', async () => {
    twin.recallVisitorHistory.mockRejectedValueOnce(new Error('db down'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recall(ctxOf(web))).rejects.toThrow('db down')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('s1'), expect.any(Error))
    log.mockRestore()
  })
})
