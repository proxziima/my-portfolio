import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it, vi } from 'vitest'
import { CONTEXT_NOTE_PREFIX } from '@repo/twin/contract'
import { AbuseVerdict, GateDecision, classifyMessage, closingContext, countsAsViolation, deflectionContext, offScopeContext } from '../agent/lib/abuse'

const mock = vi.hoisted(() => ({ model: null as unknown }))
vi.mock('../agent/lib/models', () => ({ classifierModel: () => mock.model }))

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

describe('abuse', () => {
  it('has a stable verdict enum', () => {
    expect(AbuseVerdict.options).toEqual(['ok', 'off_scope', 'harassment', 'sexual', 'hate', 'prompt_attack', 'spam'])
  })

  it('builds one deflection note and a closing note on the last strike', () => {
    expect(deflectionContext('harassment', false)).toMatch(/one brief, calm, in-character line/)
    expect(deflectionContext('spam', true)).toMatch(/last message/)
  })

  it('offers off_scope as a verdict, with its depth', async () => {
    const model = answering(JSON.stringify({ verdict: 'off_scope', depth: 'light' }))
    mock.model = model
    expect(await classifyMessage('give me a brownie recipe', [], 1_000)).toEqual({ verdict: 'off_scope', depth: 'light' })
    // Output.object sends the gate schema as the response format, so the model can pick any verdict.
    const [call] = model.doGenerateCalls
    expect(JSON.stringify(call?.responseFormat)).toContain('off_scope')
  })

  it('has a gate decision of verdict and depth', () => {
    expect(GateDecision.parse({ verdict: 'ok', depth: 'deep' })).toEqual({ verdict: 'ok', depth: 'deep' })
    expect(GateDecision.safeParse({ verdict: 'ok', depth: 'huge' }).success).toBe(false)
  })

  it('counts only abusive verdicts as violations', () => {
    expect(countsAsViolation('ok')).toBe(false)
    expect(countsAsViolation('off_scope')).toBe(false)
    for (const v of ['harassment', 'sexual', 'hate', 'prompt_attack', 'spam'] as const) expect(countsAsViolation(v)).toBe(true)
  })

  it('tells the model to decline an off-scope request in character, without fulfilling any part', () => {
    const note = offScopeContext()
    expect(note.startsWith(CONTEXT_NOTE_PREFIX)).toBe(true)
    expect(note).toMatch(/outside my work/)
    expect(note).toMatch(/Do not fulfil any part of it/)
    expect(note).toMatch(/steer back/)
  })

  it('returns the parsed verdict and depth', async () => {
    mock.model = answering(JSON.stringify({ verdict: 'harassment', depth: 'light' }))
    expect(await classifyMessage('you are useless', [], 1_000)).toEqual({ verdict: 'harassment', depth: 'light' })
    mock.model = answering(JSON.stringify({ verdict: 'ok', depth: 'deep' }))
    expect(await classifyMessage('how would you design the eval pipeline?', [], 1_000)).toEqual({ verdict: 'ok', depth: 'deep' })
  })

  it('shows the previous exchange as context for depth only, truncated to 600 characters', async () => {
    const model = answering(JSON.stringify({ verdict: 'ok', depth: 'deep' }))
    mock.model = model
    const previous = [
      { role: 'visitor' as const, text: `v${'a'.repeat(700)}` },
      { role: 'twin' as const, text: 'short reply' },
    ]
    await classifyMessage('and with streaming?', previous, 1_000)
    const [call] = model.doGenerateCalls
    const prompt = JSON.stringify(call?.prompt)
    expect(prompt).toContain('Previous exchange (context for depth only):')
    expect(prompt).toContain(`visitor: v${'a'.repeat(599)}`)
    expect(prompt).not.toContain('a'.repeat(600))
    expect(prompt).toContain('twin: short reply')
    expect(prompt).toContain('Message to classify:')
    expect(prompt).toContain('and with streaming?')
    expect(prompt.indexOf('Previous exchange')).toBeLessThan(prompt.indexOf('Message to classify:'))
  })

  it('omits the previous-exchange section when there is none', async () => {
    const model = answering(JSON.stringify({ verdict: 'ok', depth: 'light' }))
    mock.model = model
    await classifyMessage('oi', [], 1_000)
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).not.toContain('Previous exchange')
    expect(prompt).toContain('Message to classify:')
  })

  it('times out to ok and standard so a slow classifier never blocks the conversation', async () => {
    mock.model = hanging()
    expect(await classifyMessage('hello', [], 20)).toEqual({ verdict: 'ok', depth: 'standard' })
  })

  it('fails open and logs when the classifier fails for another reason', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock.model = new MockLanguageModelV4({ doGenerate: async () => { throw new Error('boom') } })
    expect(await classifyMessage('hello', [], 1_000)).toEqual({ verdict: 'ok', depth: 'standard' })
    expect(spy).toHaveBeenCalledWith('[twin] abuse classifier failed', { name: 'Error', message: 'boom' })
    spy.mockRestore()
  })

  it('shares the context-note prefix between deflection and closing notes', () => {
    expect(CONTEXT_NOTE_PREFIX).toBe('[context, not from the visitor]')
    expect(deflectionContext('harassment', false).startsWith(CONTEXT_NOTE_PREFIX)).toBe(true)
    expect(closingContext().startsWith(CONTEXT_NOTE_PREFIX)).toBe(true)
    expect(deflectionContext('spam', true)).toContain(closingContext().slice(CONTEXT_NOTE_PREFIX.length).trim())
  })
})
