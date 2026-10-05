import { requireIntegration } from '@repo/twin/env'
import SendblueAPI, { APIConnectionTimeoutError, APIError } from 'sendblue'
import { FatalError } from 'workflow'
import { getEnv } from './env'

const SEND_TIMEOUT_MS = 10_000
/** Client errors Sendblue will always repeat: bad request, bad credentials, refused or unknown number, invalid content. */
const PERMANENT = new Set([400, 401, 403, 404, 422])

/**
 * Texts the owner from the Sendblue line and returns Sendblue's message handle. SDK retries are
 * off: the calling workflow step owns retries. Permanent failures throw `FatalError` so the step
 * doesn't retry them; 429, 5xx, timeouts and network errors stay retryable. Error messages carry
 * the status and Sendblue's own message only, never credentials.
 */
export async function sendToOwner(text: string): Promise<string | null> {
  const env = getEnv()
  const im = requireIntegration(env, 'imessage')
  const client = new SendblueAPI({
    apiKey: im.SENDBLUE_API_KEY,
    apiSecret: im.SENDBLUE_API_SECRET,
    baseURL: env.SENDBLUE_API_BASE,
    maxRetries: 0,
    timeout: SEND_TIMEOUT_MS,
  })
  let res: Awaited<ReturnType<typeof client.messages.send>>
  try {
    res = await client.messages.send({ number: im.OWNER_PHONE_NUMBER, from_number: im.SENDBLUE_FROM_NUMBER, content: text })
  } catch (e) {
    if (e instanceof APIConnectionTimeoutError) throw new Error('Sendblue send timed out')
    if (e instanceof APIError && typeof e.status === 'number') {
      const detail = (e.error as { error_message?: unknown } | undefined)?.error_message
      const message = `Sendblue send failed: HTTP ${e.status}${typeof detail === 'string' ? ` ${detail}` : ''}`
      throw PERMANENT.has(e.status) ? new FatalError(message) : new Error(message)
    }
    throw new Error('Sendblue send request failed', { cause: e })
  }
  if (res.status === 'ERROR') throw new FatalError(`Sendblue refused the message: ${res.error_message ?? 'no reason given'}`)
  return res.message_handle ?? null
}
