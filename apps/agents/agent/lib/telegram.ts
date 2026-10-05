import { FatalError } from 'workflow'
import { z } from 'zod'
import { getEnv } from './env'
import { isUuid } from './uuid'

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

/** A decision tap, or null for anything else (including an id that is not a strict UUID). */
export function parseCallback(u: TelegramUpdate): {
  queryId: string
  fromId: string
  approvalId: string
  status: 'approved' | 'denied'
  chatId: number
  messageId: number
} | null {
  const q = u.callback_query
  const m = q?.data ? /^([ad]):(.+)$/.exec(q.data) : null
  const approvalId = m?.[2]
  if (!q || !m || !approvalId || !isUuid(approvalId) || !q.message) return null
  return {
    queryId: q.id,
    fromId: String(q.from.id),
    approvalId,
    status: m[1] === 'a' ? 'approved' : 'denied',
    chatId: q.message.chat.id,
    messageId: q.message.message_id,
  }
}

const BOT_TIMEOUT_MS = 10_000

const BotReply = z.object({
  ok: z.boolean(),
  result: z.unknown().optional(),
  description: z.string().optional(),
})

/** The reply body as JSON, or null when it is not (a proxy's HTML error page, a cut-off body). */
function parseReply(text: string): z.infer<typeof BotReply> | null {
  try {
    const parsed = BotReply.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Calls one Bot API method and validates `ok`. 400 and 403 are permanent (bad request, owner never
 * started or blocked the bot), so they throw `FatalError` and the calling step doesn't retry;
 * 429, 5xx and network failures stay retryable. The URL carries the token, so no error mentions
 * it: messages are built from the method, the status and Telegram's description only.
 */
async function bot<T>(
  method: string,
  body: Record<string, unknown>,
  result: z.ZodType<T>,
): Promise<T> {
  const env = getEnv()
  const redact = (s: string) =>
    s.replaceAll(env.TELEGRAM_API_BASE, '<api>').replaceAll(env.TELEGRAM_BOT_TOKEN, '<token>')
  let res: Response
  try {
    res = await fetch(`${env.TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(BOT_TIMEOUT_MS),
    })
  } catch (e) {
    const kind = e instanceof Error && e.name === 'TimeoutError' ? 'timed out' : 'request failed'
    throw new Error(`Telegram ${method} ${kind}`)
  }
  const reply = parseReply(await res.text())
  if (res.ok && reply?.ok) return result.parse(reply.result)
  const message = redact(`Telegram ${method} failed: HTTP ${res.status}${reply?.description ? ` ${reply.description}` : ''}`)
  if (res.status === 400 || res.status === 403) throw new FatalError(message)
  throw new Error(message)
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
