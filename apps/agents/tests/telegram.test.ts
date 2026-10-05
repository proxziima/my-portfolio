import { describe, expect, it } from 'vitest'
import { approvalKeyboard, parseCallback, TelegramUpdate } from '../agent/lib/telegram'

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
})
