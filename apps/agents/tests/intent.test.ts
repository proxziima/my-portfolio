import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it, vi } from 'vitest'
import { initialConversationState, IntentClass, type ConversationState } from '@repo/twin/contract'
import { INTENT_WEIGHTS } from '../agent/lib/intent/weights'
import { signalsOf } from '../agent/lib/intent/signals'
import { scoreIntent } from '../agent/lib/intent/score'
import { classifyIntent } from '../agent/lib/intent/classify'

const mock = vi.hoisted(() => ({ model: null as unknown }))
vi.mock('../agent/lib/models', () => ({ classifierModel: () => mock.model }))

const s = (patch: Partial<ConversationState>): ConversationState => ({ ...initialConversationState(), ...patch })

describe('intent scoring', () => {
  it('keeps thresholds ordered and every reason non-empty', () => {
    expect(INTENT_WEIGHTS.thresholds.warmAt).toBeLessThan(INTENT_WEIGHTS.thresholds.hotAt)
    const r = scoreIntent(signalsOf(s({})), 'browsing', s({}))
    expect(r.tier).toBe('cold')
    expect(r.reasons.length).toBeGreaterThan(0)
  })

  // The main model handles an explicit ask in the same reply (schedule_call, trigger explicit_request);
  // the post-reply label is corroborating evidence only, so one misread can never force the widget.
  it('no classification alone reaches hot', () => {
    for (const label of IntentClass.options) {
      expect(scoreIntent(signalsOf(s({})), label, s({})).tier).not.toBe('hot')
      expect(INTENT_WEIGHTS.classification[label]).toBeLessThan(INTENT_WEIGHTS.thresholds.hotAt)
    }
  })

  it('requesting_call goes through the thresholds like any label', () => {
    const r = scoreIntent(signalsOf(s({})), 'requesting_call', s({}))
    expect(r.score).toBe(INTENT_WEIGHTS.classification.requesting_call)
    expect(r.tier).toBe('cold')
    expect(r.reasons).toContain(`classified requesting_call (+${INTENT_WEIGHTS.classification.requesting_call})`)
    expect(r.reasons.some((x) => x.includes('explicit request'))).toBe(false)
  })

  // Regression: "Sim, fala mais da Nexo Labs." was labelled requesting_call and the next turn's
  // technical answer came with the booking widget on top. One misread now reaches warm at most.
  it('a misread requesting_call on a deep returning conversation stays below hot', () => {
    const st = s({ turnCount: 4, returningVisitor: true, citedSources: ['experiences:autodoc', 'experiences:nexo', 'projects:1'] })
    const sig = signalsOf(st)
    expect(sig).toMatchObject({ specificWorkCited: true, deepConversation: true, returningVisitor: true, turnCount: 4 })
    const r = scoreIntent(sig, 'requesting_call', st)
    expect(r.score).toBeLessThan(INTENT_WEIGHTS.thresholds.hotAt)
    expect(r.tier).toBe('warm')
  })

  it('requesting_call with corroborating signals still reaches hot', () => {
    const st = s({ turnCount: 5, toolsUsed: ['check_availability'], visitor: { name: 'Ana', kind: 'recruiter' } })
    expect(scoreIntent(signalsOf(st), 'requesting_call', st).tier).toBe('hot')
  })

  it('accumulates conversation signals into warm and hot', () => {
    const warm = s({ turnCount: 4, toolsUsed: ['check_availability'], citedSources: ['projects:1'] })
    expect(scoreIntent(signalsOf(warm), 'evaluating', warm).tier).toBe('warm')
    const hot = s({ ...warm, visitor: { name: 'Ana', kind: 'recruiter' }, restrictedCategoriesRequested: ['availability'] })
    expect(scoreIntent(signalsOf(hot), 'hiring_signal', hot).tier).toBe('hot')
  })

  // An explicit ask after a decline is the main model's call (explicit_request), not the score's.
  it('a decline caps the score below warm, whatever the label', () => {
    const declined = s({ callOfferDeclined: true, turnCount: 6, toolsUsed: ['check_availability'], visitor: { name: 'Ana', kind: 'recruiter' } })
    const r = scoreIntent(signalsOf(declined), 'hiring_signal', declined)
    expect(r.tier).toBe('cold')
    expect(r.reasons.some((x) => x.includes('declined'))).toBe(true)
    expect(scoreIntent(signalsOf(declined), 'requesting_call', declined).tier).toBe('cold')
  })

  it('scores from signals alone when the classifier timed out', () => {
    const r = scoreIntent(signalsOf(s({ turnCount: 2 })), null, s({ turnCount: 2 }))
    expect(r.reasons.some((x) => x.includes('classifier unavailable'))).toBe(true)
  })

  it('keeps the tier once the widget was shown', () => {
    const shown = s({ widgetShown: true, intent: { score: 9, tier: 'hot', lastEvaluationId: 'e1' } })
    const r = scoreIntent(signalsOf(shown), 'browsing', shown)
    expect(r.tier).toBe('hot')
    expect(r.reasons.some((x) => x.includes('widget shown'))).toBe(true)
  })
})

const answering = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
      warnings: [],
    }),
  })

/** A model that never answers and only settles when the caller aborts. */
const hanging = () =>
  new MockLanguageModelV4({
    doGenerate: ({ abortSignal }) =>
      new Promise<Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>>((_, reject) => {
        abortSignal?.addEventListener('abort', () => reject(abortSignal.reason))
      }),
  })

const turns = [{ role: 'visitor' as const, text: 'Can we talk about a role next week?' }]

describe('intent classifier', () => {
  it('returns the classifier choice', async () => {
    mock.model = answering(JSON.stringify({ result: 'requesting_call' }))
    expect(await classifyIntent(turns, 1_000)).toBe('requesting_call')
  })

  it('returns null on timeout', async () => {
    mock.model = hanging()
    expect(await classifyIntent(turns, 20)).toBeNull()
  })

  it('returns null and logs on any other failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock.model = new MockLanguageModelV4({ doGenerate: async () => { throw new Error('boom') } })
    expect(await classifyIntent(turns, 1_000)).toBeNull()
    expect(spy).toHaveBeenCalledWith('[twin] intent classifier failed', { name: 'Error', message: 'boom' })
    spy.mockRestore()
  })
})
