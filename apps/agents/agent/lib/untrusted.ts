import { createHmac } from 'node:crypto'
import { getEnv } from './env'

const neutralise = (s: string) => s.replace(/<(\/?)untrusted/gi, '‹$1untrusted')

let key: string | null = null

/**
 * The key for untrusted-block nonces: HMAC-SHA256 of a fixed label under the prompt canary. Nonces
 * must never be derived from the raw canary, so every caller of `untrusted()` passes this.
 */
export function untrustedKey(): string {
  key ??= createHmac('sha256', getEnv().TWIN_PROMPT_CANARY).update('untrusted-nonce').digest('hex')
  return key
}

/**
 * Wraps external or CMS content as data (spec §10). The nonce is an HMAC of the content under a
 * server secret, so content authors can't predict the closing tag, and the same content always
 * renders the same prompt (replay- and cache-friendly).
 */
export function untrusted(source: string, content: string, key: string): string {
  const body = neutralise(content)
  const nonce = createHmac('sha256', key).update(`${source}\n${body}`).digest('hex').slice(0, 16)
  return `<untrusted source="${source}" nonce="${nonce}">\n${body}\n</untrusted nonce="${nonce}">`
}
