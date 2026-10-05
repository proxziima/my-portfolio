import { createServer, type Server } from 'node:http'

/** Every Bot API call the twin made, for assertions; nobody ever taps a button. */
export const telegramCalls: Array<{ method: string; body: unknown }> = []

/** A local Bot API stand-in (Telegram supports custom API servers); always `ok`. */
export function startTelegramStub(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const method = req.url?.split('/').at(-1) ?? ''
      telegramCalls.push({ method, body: raw ? JSON.parse(raw) : null })
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true, result: method === 'sendMessage' ? { message_id: telegramCalls.length } : true }))
    })
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}
