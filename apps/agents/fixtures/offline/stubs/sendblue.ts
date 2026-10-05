import { createServer, type Server } from 'node:http'

/** Every message the twin texted the owner, for assertions; nobody ever replies. */
export const sendblueMessages: unknown[] = []

/** A local stand-in for Sendblue's `POST /api/send-message`; always queues. */
export function startSendblueStub(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      sendblueMessages.push(raw ? JSON.parse(raw) : null)
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ status: 'QUEUED', message_handle: `stub-${sendblueMessages.length}` }))
    })
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}
