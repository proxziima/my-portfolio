import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it, vi } from 'vitest'
import { AbuseVerdict, CONTEXT_NOTE_PREFIX, classifyAbuse, closingContext, deflectionContext } from '../agent/lib/abuse'

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
    expect(AbuseVerdict.options).toEqual(['ok', 'harassment', 'sexual', 'hate', 'prompt_attack', 'spam'])
  })

  it('builds one deflection note and a closing note on the last strike', () => {
    expect(deflectionContext('harassment', false)).toMatch(/one brief, calm, in-character line/)
    expect(deflectionContext('spam', true)).toMatch(/last message/)
  })

  it('returns the classifier choice', async () => {
    mock.model = answering(JSON.stringify({ result: 'harassment' }))
    expect(await classifyAbuse('you are useless', 1_000)).toBe('harassment')
  })

  it('times out to ok so a slow classifier never blocks the conversation', async () => {
    mock.model = hanging()
    expect(await classifyAbuse('hello', 20)).toBe('ok')
  })

  it('fails open and logs when the classifier fails for another reason', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mock.model = new MockLanguageModelV4({ doGenerate: async () => { throw new Error('boom') } })
    expect(await classifyAbuse('hello', 1_000)).toBe('ok')
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
