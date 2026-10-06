import { FatalError } from 'workflow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const PROJECT_SECRET = 'photon-secret-VALUE'
const IMESSAGE_ENV = {
  IMESSAGE_PROJECT_ID: 'photon-project-1',
  IMESSAGE_PROJECT_SECRET: PROJECT_SECRET,
  IMESSAGE_WEBHOOK_SECRET: 'photon-webhook-VALUE',
  OWNER_PHONE_NUMBER: '+5511999998888',
}
const THREAD = 'imessage:iMessage;-;+5511999998888~shared'

const m = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  openDM: vi.fn(),
  postMessage: vi.fn(),
  configs: [] as { credentials: () => unknown }[],
}))
vi.mock('@photon-ai/chat-adapter-imessage', () => ({
  createiMessageAdapter: (config: { credentials: () => unknown }) => {
    m.configs.push(config)
    return { openDM: m.openDM, postMessage: m.postMessage }
  },
}))
vi.mock('../agent/lib/env', () => ({ getEnv: () => m.env }))

const { photonCredentials, sendToOwner } = await import('../agent/lib/imessage')

beforeEach(() => {
  m.openDM.mockReset()
  m.postMessage.mockReset()
  m.env = IMESSAGE_ENV
})

describe('sendToOwner', () => {
  it('opens a DM with the owner and posts the text, returning the sent message id', async () => {
    m.openDM.mockResolvedValue(THREAD)
    m.postMessage.mockResolvedValue({ id: 'msg-1', threadId: THREAD, raw: {} })
    expect(await sendToOwner('hello')).toBe('msg-1')
    expect(m.openDM).toHaveBeenCalledWith('+5511999998888')
    expect(m.postMessage).toHaveBeenCalledWith(THREAD, 'hello')
  })

  it('builds one adapter per process, with lazy project credentials', async () => {
    m.openDM.mockResolvedValue(THREAD)
    m.postMessage.mockResolvedValue({ id: 'msg-2', threadId: THREAD, raw: {} })
    await sendToOwner('a')
    await sendToOwner('b')
    expect(m.configs).toHaveLength(1)
    expect(m.configs[0]!.credentials()).toEqual({ projectId: 'photon-project-1', projectSecret: PROJECT_SECRET })
  })

  it('fails permanently when iMessage is not configured, without touching the adapter', async () => {
    m.env = {}
    const err = await sendToOwner('x').catch((e: unknown) => e)
    expect(FatalError.is(err)).toBe(true)
    expect(m.openDM).not.toHaveBeenCalled()
  })

  it('keeps adapter failures retryable, with their cause and without secrets', async () => {
    const cause = new Error('spectrum unavailable')
    m.openDM.mockRejectedValue(cause)
    const err = await sendToOwner('x').catch((e: unknown) => e)
    expect(FatalError.is(err)).toBe(false)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('Photon send failed')
    expect((err as Error).cause).toBe(cause)
    expect(String(err)).not.toContain(PROJECT_SECRET)
  })
})

describe('photonCredentials', () => {
  it('throws when iMessage is not configured', () => {
    m.env = {}
    expect(() => photonCredentials()).toThrow()
  })
})
