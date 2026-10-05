import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: { kind: 'visitor' },
  classifyAbuse: vi.fn(),
  updateConversation: vi.fn(),
}))

vi.mock('eve/channels/eve', () => ({
  eveChannel: (config: unknown) => config,
  defaultEveAuth: () => mocks.auth,
}))
vi.mock('eve/channels/auth', () => ({ localDev: () => ({ kind: 'local-dev' }) }))
vi.mock('../agent/lib/visitor-auth', () => ({ visitorAuth: { kind: 'visitor-auth' } }))
vi.mock('../agent/lib/conversation', () => ({ ensureConversation: async () => ({ ended: false }) }))
vi.mock('../agent/lib/env', () => ({ getEnv: () => ({ TWIN_ABUSE_TIMEOUT_MS: 10 }) }))
vi.mock('../agent/lib/db', () => ({ db: () => ({}) }))
vi.mock('@repo/twin/db', () => ({ updateConversation: mocks.updateConversation }))
vi.mock('../agent/lib/abuse', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../agent/lib/abuse')>()),
  classifyAbuse: mocks.classifyAbuse,
}))

import channel from '../agent/channels/eve'
import { deflectionContext, offScopeContext } from '../agent/lib/abuse'

type OnMessage = (ctx: unknown, message: string) => Promise<{ auth: unknown; context?: string[] }>
const onMessage = (channel as unknown as { onMessage: OnMessage }).onMessage
const withSession = { eve: { sessionId: 's1' } }

describe('visitor channel gate', () => {
  beforeEach(() => {
    mocks.classifyAbuse.mockReset()
    mocks.updateConversation.mockReset()
    // The real helper applies the updater to the stored state; mirror that on a fresh conversation.
    mocks.updateConversation.mockImplementation(
      async (_db: unknown, _id: string, update: (s: { violations: number; ended: boolean }) => unknown) =>
        update({ violations: 0, ended: false }),
    )
  })

  it('deflects an off-scope request without counting a violation', async () => {
    mocks.classifyAbuse.mockResolvedValue('off_scope')
    expect(await onMessage(withSession, 'me passa uma receita')).toEqual({
      auth: mocks.auth,
      context: [offScopeContext()],
    })
    expect(mocks.updateConversation).not.toHaveBeenCalled()
  })

  it('counts a harassment verdict and deflects it', async () => {
    mocks.classifyAbuse.mockResolvedValue('harassment')
    expect(await onMessage(withSession, 'seu inútil')).toEqual({
      auth: mocks.auth,
      context: [deflectionContext('harassment', false)],
    })
    expect(mocks.updateConversation).toHaveBeenCalledTimes(1)
  })

  it('passes an ok message through with no context', async () => {
    mocks.classifyAbuse.mockResolvedValue('ok')
    expect(await onMessage(withSession, 'oi')).toEqual({ auth: mocks.auth })
    expect(mocks.updateConversation).not.toHaveBeenCalled()
  })

  it('skips the gate when there is no session id', async () => {
    expect(await onMessage({ eve: {} }, 'oi')).toEqual({ auth: mocks.auth })
    expect(mocks.classifyAbuse).not.toHaveBeenCalled()
  })
})
