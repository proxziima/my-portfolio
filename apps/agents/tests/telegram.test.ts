import { afterEach, describe, expect, it, vi } from 'vitest'
import { FatalError } from 'workflow'
import { approvalKeyboard, markDecided, parseCallback, sendApprovalRequest, TelegramUpdate } from '../agent/lib/telegram'

const TOKEN = '123456:SECRET-token_value'
vi.mock('../agent/lib/env', () => ({
  getEnv: () => ({ TELEGRAM_API_BASE: 'https://tg.test', TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_OWNER_USER_ID: '42' }),
}))

afterEach(() => vi.unstubAllGlobals())

function respond(status: number, body: string) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(body, { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function failure(p: Promise<unknown>): Promise<Error> {
  try {
    await p
  } catch (e) {
    return e as Error
  }
  throw new Error('expected a rejection')
}

describe('telegram', () => {
  it('keeps callback data within 64 bytes', () => {
    const kb = approvalKeyboard('3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f')
    for (const row of kb.inline_keyboard)
      for (const b of row) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64)
  })

  it('parses an owner decision and ignores other updates', () => {
    const update = TelegramUpdate.parse({
      update_id: 1,
      callback_query: {
        id: 'q',
        from: { id: 42 },
        data: 'a:3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f',
        message: { message_id: 7, chat: { id: 42 } },
      },
    })
    expect(parseCallback(update)).toEqual({
      queryId: 'q',
      fromId: '42',
      approvalId: '3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f',
      status: 'approved',
      chatId: 42,
      messageId: 7,
    })
    expect(
      parseCallback(
        TelegramUpdate.parse({
          update_id: 2,
          message: { message_id: 1, chat: { id: 1 }, text: 'hi' },
        }),
      ),
    ).toBeNull()
  })

  it('ignores a tap whose id is not a strict uuid (version and variant nibbles included)', () => {
    const tap = (data: string) =>
      parseCallback({
        update_id: 3,
        callback_query: { id: 'q', from: { id: 42 }, data, message: { message_id: 7, chat: { id: 42 } } },
      })
    expect(tap('a:3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f')).not.toBeNull()
    for (const bad of [
      'a:------------------------------------',
      'a:3f1c2b9e8a7d4c6b9e5f1a2b3c4d5e6f----',
      'a:3f1c2b9e-8a7d-0c6b-9e5f-1a2b3c4d5e6f', // version 0
      'a:3f1c2b9e-8a7d-4c6b-7e5f-1a2b3c4d5e6f', // variant 7
      'a:3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f0',
      'x:3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f',
    ])
      expect(tap(bad)).toBeNull()
  })
})

describe('update shape', () => {
  it('rejects an update Telegram would keep redelivering without throwing', () => {
    expect(TelegramUpdate.safeParse({ update_id: 'x' }).success).toBe(false)
    expect(TelegramUpdate.safeParse(null).success).toBe(false)
  })
})

describe('bot api calls', () => {
  it('sends the request with a timeout and returns the message id', async () => {
    const fetchMock = respond(200, JSON.stringify({ ok: true, result: { message_id: 9 } }))
    expect(await sendApprovalRequest('3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f', 'hi')).toBe(9)
    const init = fetchMock.mock.calls[0]?.[1]
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(String(init?.body))).toMatchObject({ chat_id: '42', text: 'hi' })
  })

  it('fails permanently on 400 and 403, never retrying a request Telegram will always refuse', async () => {
    for (const status of [400, 403]) {
      respond(status, JSON.stringify({ ok: false, error_code: status, description: 'Forbidden: bot was blocked by the user' }))
      const err = await failure(markDecided(7, 'done'))
      expect(FatalError.is(err)).toBe(true)
      expect(err.message).toContain(String(status))
    }
  })

  it('keeps rate limits and server errors retryable', async () => {
    for (const status of [429, 502]) {
      respond(status, JSON.stringify({ ok: false, description: 'Too Many Requests' }))
      const err = await failure(markDecided(7, 'done'))
      expect(FatalError.is(err)).toBe(false)
      expect(err.message).toContain(String(status))
    }
  })

  it('reports an HTML error page by its status', async () => {
    respond(502, '<html><body>Bad Gateway</body></html>')
    const err = await failure(markDecided(7, 'done'))
    expect(err.message).toMatch(/502/)
    expect(FatalError.is(err)).toBe(false)
  })

  it('never puts the token or the url in an error', async () => {
    respond(403, JSON.stringify({ ok: false, description: `Unauthorized for https://tg.test/bot${TOKEN}` }))
    const forbidden = await failure(markDecided(7, 'done'))
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError(`fetch failed: https://tg.test/bot${TOKEN}/editMessageText`) }))
    const network = await failure(markDecided(7, 'done'))
    for (const err of [forbidden, network]) {
      expect(err.message).not.toContain(TOKEN)
      expect(err.message).not.toContain('tg.test')
      expect(JSON.stringify(err.cause ?? null)).not.toContain(TOKEN)
    }
  })
})
