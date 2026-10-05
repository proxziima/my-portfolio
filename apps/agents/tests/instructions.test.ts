import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initialConversationState, type ConversationState } from '@repo/twin/contract'
import { NOTES_UNAVAILABLE } from '../agent/lib/prompt'

const m = vi.hoisted(() => ({
  ensureConversation: vi.fn(),
  cachedGrounding: vi.fn(),
  getEnv: vi.fn(),
  updateConversation: vi.fn(),
  setEvaluationOutcome: vi.fn(),
}))
vi.mock('../agent/lib/conversation', () => ({ ensureConversation: m.ensureConversation }))
vi.mock('../agent/lib/grounding', () => ({ cachedGrounding: m.cachedGrounding }))
vi.mock('../agent/lib/env', () => ({ getEnv: m.getEnv }))
vi.mock('../agent/lib/db', () => ({ db: () => ({}) }))
vi.mock('@repo/twin/db', () => ({ updateConversation: m.updateConversation, setEvaluationOutcome: m.setEvaluationOutcome }))

const { default: dynamic } = await import('../agent/instructions')
const resolve = dynamic.events['turn.started'] as (event: unknown, ctx: unknown) => Promise<{ content: string; role: string }>
const ctx = { session: { id: 's1', auth: { current: null } } }
const warm = (patch: Partial<ConversationState> = {}): ConversationState => ({
  ...initialConversationState(),
  turnCount: 3,
  intent: { score: 60, tier: 'warm', lastEvaluationId: 'ev1' },
  ...patch,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.getEnv.mockReturnValue({ TWIN_PROMPT_CANARY: 'CANARY-1' })
  m.cachedGrounding.mockResolvedValue('<grounding>g</grounding>')
  m.ensureConversation.mockResolvedValue(initialConversationState())
  m.updateConversation.mockImplementation(async (_db: unknown, _id: string, f: (s: ConversationState) => ConversationState) => f(warm()))
})

describe('turn instructions', () => {
  it('composes canary, grounding, skills and digest as system text', async () => {
    const out = await resolve({}, ctx)
    expect(out.role).toBe('system')
    expect(out.content).toMatch(/^Internal marker CANARY-1[\s\S]*<grounding>[\s\S]*<skill name="scheduling"[\s\S]*<conversation_state>/)
  })

  it('falls back to identity and boundaries when the state cannot be loaded', async () => {
    m.ensureConversation.mockRejectedValueOnce(new Error('db down'))
    const out = await resolve({}, ctx)
    expect(out.content).toContain('Internal marker CANARY-1')
    expect(out.content).toContain(NOTES_UNAVAILABLE)
    expect(out.content.match(/<skill /g)).toHaveLength(2)
  })

  it('falls back without marking an offer when grounding is unavailable', async () => {
    m.ensureConversation.mockResolvedValue(warm())
    m.cachedGrounding.mockRejectedValueOnce(new Error('cms down'))
    const out = await resolve({}, ctx)
    expect(out.content).toContain(NOTES_UNAVAILABLE)
    expect(m.updateConversation).not.toHaveBeenCalled()
  })

  it('omits the canary line from the fallback when the env is unreadable', async () => {
    m.getEnv.mockImplementation(() => {
      throw new Error('missing env')
    })
    const out = await resolve({}, ctx)
    expect(out.content).not.toContain('Internal marker')
    expect(out.content).toContain(NOTES_UNAVAILABLE)
  })

  it('keys a new warm offer to this turn and marks the evaluation offered', async () => {
    m.ensureConversation.mockResolvedValue(warm())
    const out = await resolve({}, ctx)
    const update = m.updateConversation.mock.calls[0]?.[2] as (s: ConversationState) => ConversationState
    expect(update(warm()).callOfferTurn).toBe(3)
    expect(update(warm({ callOfferTurn: 2 })).callOfferTurn).toBe(2)
    expect(m.setEvaluationOutcome).toHaveBeenCalledWith({}, 'ev1', 'offered')
    expect(out.content).toContain('call: warm:')
  })

  it('keeps the offer turn when the evaluation outcome write fails, logging instead of falling back', async () => {
    m.ensureConversation.mockResolvedValue(warm())
    m.setEvaluationOutcome.mockRejectedValueOnce(new Error('label write failed'))
    const out = await resolve({}, ctx)
    expect(out.content).not.toContain(NOTES_UNAVAILABLE)
    expect(out.content).toContain('call: warm:')
    expect(console.error).toHaveBeenCalledWith('[twin] evaluation outcome write failed', expect.any(Error))
  })

  it('re-issues the offer on a replayed step without writing again', async () => {
    m.ensureConversation.mockResolvedValue(warm({ callOfferTurn: 3 }))
    const out = await resolve({}, ctx)
    expect(m.updateConversation).not.toHaveBeenCalled()
    expect(out.content).toContain('call: warm:')
  })
})
