import { APIConnectionError, APIConnectionTimeoutError, APIError } from 'sendblue'
import { FatalError } from 'workflow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const API_KEY = 'sb-key-VALUE'
const API_SECRET = 'sb-secret-VALUE'

const m = vi.hoisted(() => ({ send: vi.fn(), options: [] as unknown[] }))
vi.mock('sendblue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sendblue')>()
  class FakeClient {
    messages = { send: m.send }
    constructor(opts: unknown) {
      m.options.push(opts)
    }
  }
  return { ...actual, default: FakeClient }
})
vi.mock('../agent/lib/env', () => ({
  getEnv: () => ({
    SENDBLUE_API_BASE: 'https://sb.test',
    SENDBLUE_API_KEY: 'sb-key-VALUE',
    SENDBLUE_API_SECRET: 'sb-secret-VALUE',
    SENDBLUE_FROM_NUMBER: '+15550000001',
    SENDBLUE_WEBHOOK_SECRET: 'sb_secret_value_1234',
    OWNER_PHONE_NUMBER: '+5511999998888',
  }),
}))

const { sendToOwner } = await import('../agent/lib/imessage')

beforeEach(() => {
  m.send.mockReset()
  m.options.length = 0
})

describe('sendToOwner', () => {
  it('texts the owner from the Sendblue line with SDK retries off and a timeout', async () => {
    m.send.mockResolvedValue({ status: 'QUEUED', message_handle: 'h-1' })
    expect(await sendToOwner('hello')).toBe('h-1')
    expect(m.send).toHaveBeenCalledWith({ number: '+5511999998888', from_number: '+15550000001', content: 'hello' })
    expect(m.options[0]).toMatchObject({ apiKey: API_KEY, apiSecret: API_SECRET, baseURL: 'https://sb.test', maxRetries: 0, timeout: 10_000 })
  })

  it.each([400, 401, 403, 404, 422])('fails permanently on HTTP %i', async (status) => {
    m.send.mockRejectedValue(APIError.generate(status, { error_message: 'nope' }, 'nope', new Headers()))
    const err = await sendToOwner('x').catch((e: unknown) => e)
    expect(FatalError.is(err)).toBe(true)
    expect(String(err)).toContain(`HTTP ${status}`)
  })

  it('keeps rate limits, server errors and timeouts retryable', async () => {
    const connection = new APIConnectionError({ message: 'Connection error.' })
    for (const e of [
      APIError.generate(429, {}, 'slow down', new Headers()),
      APIError.generate(502, {}, 'bad gateway', new Headers()),
      new APIConnectionTimeoutError(),
      connection,
    ]) {
      m.send.mockRejectedValueOnce(e)
      const err = await sendToOwner('x').catch((x: unknown) => x)
      expect(err).toBeInstanceOf(Error)
      expect(FatalError.is(err)).toBe(false)
      // Network failures keep their cause so DNS, TLS and reset errors stay diagnosable.
      if (e === connection) expect((err as Error).cause).toBe(connection)
    }
  })

  it('treats a body with status ERROR as a permanent refusal', async () => {
    m.send.mockResolvedValue({ status: 'ERROR', error_message: 'not an iMessage number' })
    const err = await sendToOwner('x').catch((e: unknown) => e)
    expect(FatalError.is(err)).toBe(true)
    expect(String(err)).toContain('not an iMessage number')
  })

  it('never puts credentials in error messages', async () => {
    m.send.mockRejectedValue(APIError.generate(401, { error_message: 'bad key' }, 'bad key', new Headers()))
    const err = String(await sendToOwner('x').catch((e: unknown) => e))
    expect(err).toContain('HTTP 401')
    expect(err).not.toContain(API_KEY)
    expect(err).not.toContain(API_SECRET)
  })
})
