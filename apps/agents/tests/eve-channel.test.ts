import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type State = { violations: number; ended: boolean; modelTier: string; modelTierAt: string | null }

const mocks = vi.hoisted(() => ({
  auth: { kind: 'visitor' },
  classifyMessage: vi.fn(),
  recentTurns: vi.fn(),
  updateConversation: vi.fn(),
  ensureConversation: vi.fn(),
}))

vi.mock('eve/channels/eve', () => ({
  eveChannel: (config: unknown) => config,
  defaultEveAuth: () => mocks.auth,
}))
vi.mock('eve/channels/auth', () => ({ localDev: () => ({ kind: 'local-dev' }) }))
vi.mock('../agent/lib/visitor-auth', () => ({ visitorAuth: { kind: 'visitor-auth' } }))
vi.mock('../agent/lib/conversation', () => ({ ensureConversation: mocks.ensureConversation }))
vi.mock('../agent/lib/env', () => ({ getEnv: () => ({ TWIN_ABUSE_TIMEOUT_MS: 10 }) }))
vi.mock('../agent/lib/db', () => ({ db: () => ({}) }))
vi.mock('../agent/lib/transcript', () => ({ recentTurns: mocks.recentTurns }))
vi.mock('@repo/twin/db', () => ({ updateConversation: mocks.updateConversation }))
vi.mock('../agent/lib/abuse', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../agent/lib/abuse')>()),
  classifyMessage: mocks.classifyMessage,
}))

import channel from '../agent/channels/eve'
import { closingContext, deflectionContext, offScopeContext } from '../agent/lib/abuse'

type OnMessage = (ctx: unknown, message: string) => Promise<{ auth: unknown; context?: string[] }>
const onMessage = (channel as unknown as { onMessage: OnMessage }).onMessage
const withSession = { eve: { sessionId: 's1' } }

/** The conversation state the channel left behind: each updater applied in turn to the state it was given. */
let stored: State

describe('visitor channel gate', () => {
  beforeEach(() => {
    mocks.classifyMessage.mockReset()
    mocks.recentTurns.mockReset()
    mocks.updateConversation.mockReset()
    mocks.ensureConversation.mockReset()
    mocks.ensureConversation.mockResolvedValue({ ended: false })
    mocks.recentTurns.mockResolvedValue([])
    stored = { violations: 0, ended: false, modelTier: 'standard', modelTierAt: null }
    // The real helper applies the updater to the stored state; mirror that on a fresh conversation.
    mocks.updateConversation.mockImplementation(async (_db: unknown, _id: string, update: (s: State) => State) => {
      stored = update(stored)
      return stored
    })
  })

  it('deflects an off-scope request without counting a violation, on the light tier', async () => {
    mocks.classifyMessage.mockResolvedValue({ verdict: 'off_scope', depth: 'deep' })
    expect(await onMessage(withSession, 'me passa uma receita')).toEqual({
      auth: mocks.auth,
      context: [offScopeContext()],
    })
    expect(stored).toMatchObject({ violations: 0, ended: false, modelTier: 'light' })
  })

  it('counts a harassment verdict, deflects it and stores the light tier', async () => {
    mocks.classifyMessage.mockResolvedValue({ verdict: 'harassment', depth: 'deep' })
    expect(await onMessage(withSession, 'seu inÃºtil')).toEqual({
      auth: mocks.auth,
      context: [deflectionContext('harassment', false)],
    })
    expect(mocks.updateConversation).toHaveBeenCalledTimes(1)
    expect(stored).toMatchObject({ violations: 1, ended: false, modelTier: 'light' })
  })

  it('passes an ok message through with no context and stores its depth', async () => {
    mocks.classifyMessage.mockResolvedValue({ verdict: 'ok', depth: 'deep' })
    expect(await onMessage(withSession, 'como vocÃª desenharia o pipeline de evals?')).toEqual({ auth: mocks.auth })
    expect(stored.modelTier).toBe('deep')
    expect(stored.violations).toBe(0)
  })

  it('stores the light tier for a light ok message', async () => {
    mocks.classifyMessage.mockResolvedValue({ verdict: 'ok', depth: 'light' })
    expect(await onMessage(withSession, 'oi')).toEqual({ auth: mocks.auth })
    expect(stored.modelTier).toBe('light')
  })

  it('stores the light tier for the closing turn of an ended conversation, without classifying', async () => {
    mocks.ensureConversation.mockResolvedValue({ ended: true })
    stored = { violations: 3, ended: true, modelTier: 'deep', modelTierAt: null }
    expect(await onMessage(withSession, 'oi de novo')).toEqual({ auth: mocks.auth, context: [closingContext()] })
    expect(mocks.classifyMessage).not.toHaveBeenCalled()
    expect(stored).toMatchObject({ violations: 3, ended: true, modelTier: 'light' })
  })

  it('classifies with the previous exchange as context', async () => {
    const previous = [
      { role: 'visitor', text: 'how do you design evals?' },
      { role: 'twin', text: 'with release gates' },
    ]
    mocks.recentTurns.mockResolvedValue(previous)
    mocks.classifyMessage.mockResolvedValue({ verdict: 'ok', depth: 'deep' })
    await onMessage(withSession, 'and for RAG?')
    expect(mocks.recentTurns).toHaveBeenCalledWith('s1', 2)
    expect(mocks.classifyMessage).toHaveBeenCalledWith('and for RAG?', previous, 10)
  })

  it('still classifies, with no context, when the previous exchange cannot be read', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.recentTurns.mockRejectedValue(new Error('db down'))
    mocks.classifyMessage.mockResolvedValue({ verdict: 'ok', depth: 'standard' })
    expect(await onMessage(withSession, 'oi')).toEqual({ auth: mocks.auth })
    expect(mocks.classifyMessage).toHaveBeenCalledWith('oi', [], 10)
    expect(stored.modelTier).toBe('standard')
    spy.mockRestore()
  })

  it('skips the gate when there is no session id', async () => {
    expect(await onMessage({ eve: {} }, 'oi')).toEqual({ auth: mocks.auth })
    expect(mocks.classifyMessage).not.toHaveBeenCalled()
    expect(mocks.updateConversation).not.toHaveBeenCalled()
  })
})

describe('visitor channel steering', () => {
  const T1 = '2026-10-05T12:00:00.000Z'
  const T2 = '2026-10-05T12:00:05.000Z'
  const T3 = '2026-10-05T12:00:09.000Z'

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    mocks.classifyMessage.mockReset()
    mocks.recentTurns.mockReset()
    mocks.updateConversation.mockReset()
    mocks.ensureConversation.mockReset()
    mocks.ensureConversation.mockResolvedValue({ ended: false })
    mocks.recentTurns.mockResolvedValue([])
    stored = { violations: 0, ended: false, modelTier: 'standard', modelTierAt: null }
    mocks.updateConversation.mockImplementation(async (_db: unknown, _id: string, update: (s: State) => State) => {
      stored = update(stored)
      return stored
    })
  })
  afterEach(() => vi.useRealTimers())

  /** A classification the test settles by hand, to finish two steered messages out of order. */
  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return { promise, resolve }
  }

  it('stamps the stored tier with when the message began classifying', async () => {
    vi.setSystemTime(new Date(T1))
    mocks.classifyMessage.mockResolvedValue({ verdict: 'ok', depth: 'deep' })
    await onMessage(withSession, 'como você desenharia o pipeline de evals?')
    expect(stored).toMatchObject({ modelTier: 'deep', modelTierAt: T1 })
  })

  it('does not let an older classification that finishes later overwrite the newer tier', async () => {
    const slow = deferred<{ verdict: string; depth: string }>()
    mocks.classifyMessage.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ verdict: 'ok', depth: 'light' })
    vi.setSystemTime(new Date(T1))
    const older = onMessage(withSession, 'explique a arquitetura em detalhe')
    vi.setSystemTime(new Date(T2))
    await onMessage(withSession, 'ah, esquece, obrigado')
    expect(stored).toMatchObject({ modelTier: 'light', modelTierAt: T2 })
    slow.resolve({ verdict: 'ok', depth: 'deep' })
    await older
    expect(stored).toMatchObject({ modelTier: 'light', modelTierAt: T2 })
  })

  it('lets the newer classification win when it finishes after the older one', async () => {
    const slow = deferred<{ verdict: string; depth: string }>()
    mocks.classifyMessage.mockReturnValueOnce(Promise.resolve({ verdict: 'ok', depth: 'light' })).mockReturnValueOnce(slow.promise)
    vi.setSystemTime(new Date(T1))
    await onMessage(withSession, 'oi')
    vi.setSystemTime(new Date(T2))
    const newer = onMessage(withSession, 'como você desenharia o pipeline de evals?')
    slow.resolve({ verdict: 'ok', depth: 'deep' })
    await newer
    expect(stored).toMatchObject({ modelTier: 'deep', modelTierAt: T2 })
  })

  it('still counts the violation of an older message that finishes later, without rewriting the tier', async () => {
    const slow = deferred<{ verdict: string; depth: string }>()
    mocks.classifyMessage.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ verdict: 'ok', depth: 'deep' })
    vi.setSystemTime(new Date(T1))
    const older = onMessage(withSession, 'seu inútil')
    vi.setSystemTime(new Date(T2))
    await onMessage(withSession, 'como você desenharia o pipeline de evals?')
    slow.resolve({ verdict: 'harassment', depth: 'light' })
    await older
    expect(stored).toMatchObject({ violations: 1, modelTier: 'deep', modelTierAt: T2 })
  })

  it('writes the tier of a violating message that is the newest', async () => {
    mocks.classifyMessage.mockResolvedValueOnce({ verdict: 'ok', depth: 'deep' }).mockResolvedValueOnce({ verdict: 'harassment', depth: 'deep' })
    vi.setSystemTime(new Date(T1))
    await onMessage(withSession, 'como você desenharia o pipeline de evals?')
    vi.setSystemTime(new Date(T3))
    await onMessage(withSession, 'seu inútil')
    expect(stored).toMatchObject({ violations: 1, modelTier: 'light', modelTierAt: T3 })
  })

  it('treats a message that began at the same instant as newer', async () => {
    mocks.classifyMessage.mockResolvedValueOnce({ verdict: 'ok', depth: 'deep' }).mockResolvedValueOnce({ verdict: 'ok', depth: 'light' })
    vi.setSystemTime(new Date(T1))
    await onMessage(withSession, 'a')
    await onMessage(withSession, 'b')
    expect(stored).toMatchObject({ modelTier: 'light', modelTierAt: T1 })
  })
})
