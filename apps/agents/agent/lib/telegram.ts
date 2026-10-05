import { z } from 'zod'
import { getEnv } from './env'

/** The subset of a Telegram Update the twin reads (Bot API: Update, CallbackQuery). */
export const TelegramUpdate = z.object({
  update_id: z.number(),
  callback_query: z
    .object({
      id: z.string(),
      from: z.object({ id: z.number() }),
      data: z.string().optional(),
      message: z.object({ message_id: z.number(), chat: z.object({ id: z.number() }) }).optional(),
    })
    .optional(),
  message: z.unknown().optional(),
})
export type TelegramUpdate = z.infer<typeof TelegramUpdate>

/** Approve/Deny buttons; callback_data is "a:<id>" or "d:<id>" (≤ 64 bytes per Bot API). */
export function approvalKeyboard(approvalId: string) {
  return {
    inline_keyboard: [
      [
        { text: 'Approve', callback_data: `a:${approvalId}` },
        { text: 'Deny', callback_data: `d:${approvalId}` },
      ],
    ],
  }
}

/** A decision tap, or null for anything else. */
export function parseCallback(u: TelegramUpdate): {
  queryId: string
  fromId: string
  approvalId: string
  status: 'approved' | 'denied'
  chatId: number
  messageId: number
} | null {
  const q = u.callback_query
  const m = q?.data ? /^([ad]):([0-9a-f-]{36})$/.exec(q.data) : null
  if (!q || !m || !q.message) return null
  return {
    queryId: q.id,
    fromId: String(q.from.id),
    approvalId: m[2] ?? '',
    status: m[1] === 'a' ? 'approved' : 'denied',
    chatId: q.message.chat.id,
    messageId: q.message.message_id,
  }
}

/** Calls one Bot API method and validates `ok`. */
async function bot<T>(
  method: string,
  body: Record<string, unknown>,
  result: z.ZodType<T>,
): Promise<T> {
  const env = getEnv()
  const res = await fetch(`${env.TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = z
    .object({ ok: z.boolean(), result: z.unknown().optional(), description: z.string().optional() })
    .parse(await res.json())
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`)
  return result.parse(json.result)
}

/** Sends the approval request to the owner; returns the message id to edit later. */
export async function sendApprovalRequest(approvalId: string, text: string): Promise<number> {
  const msg = await bot(
    'sendMessage',
    { chat_id: getEnv().TELEGRAM_OWNER_USER_ID, text, reply_markup: approvalKeyboard(approvalId) },
    z.object({ message_id: z.number() }),
  )
  return msg.message_id
}

/** Replaces the buttons with the outcome so the owner sees what happened. */
export async function markDecided(messageId: number, text: string): Promise<void> {
  await bot(
    'editMessageText',
    { chat_id: getEnv().TELEGRAM_OWNER_USER_ID, message_id: messageId, text },
    z.unknown(),
  )
}

/** Stops the spinner on the tapped button (required by the Bot API). */
export async function answerCallback(queryId: string, text: string): Promise<void> {
  await bot('answerCallbackQuery', { callback_query_id: queryId, text }, z.unknown())
}
