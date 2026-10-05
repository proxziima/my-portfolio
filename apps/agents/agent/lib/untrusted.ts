import { createHmac } from 'node:crypto'

const neutralise = (s: string) => s.replace(/<(\/?)untrusted/gi, '‹$1untrusted')

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
