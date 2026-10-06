import { createServer, type Server } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

const json = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v) }] })

/**
 * A fresh server per request: a stateless Streamable HTTP transport can't be reused across requests.
 * The tools declare no input schema: the SDK types its schemas against its own zod copy, not the
 * app's, and fixed fixture data ignores the arguments anyway.
 */
function fixtureServer(): McpServer {
  const mcp = new McpServer({ name: 'payload-stub', version: '1.0.0' })
  mcp.registerTool('twinIdentity', { description: 'identity' }, async () =>
    json({ name: 'Fixture Owner', headline: 'and builder.', location: 'Brazil', currentRoles: [{ title: 'Engineer', company: 'Fixture Co' }], voiceSamples: [] }),
  )
  mcp.registerTool('twinSearch', { description: 'search' }, async () =>
    json({
      items: [{ sourceId: 'projects:1', kind: 'project', title: 'Project: Atlas', text: 'A design system' }],
      restricted: [{ sourceId: 'knowledge:9', topic: 'Notice period', category: 'availability' }],
    }),
  )
  mcp.registerTool('twinDisclose', { description: 'disclose' }, async () =>
    json({ item: { sourceId: 'knowledge:9', kind: 'knowledge', title: 'Notice period', text: 'Thirty days' } }),
  )
  return mcp
}

/** A Payload MCP stand-in serving the three twin tools with fixed fixture data. */
export function startPayloadMcpStub(port: number): Promise<Server> {
  const server = createServer(async (req, res) => {
    const mcp = fixtureServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      void transport.close()
      void mcp.close()
    })
    try {
      await mcp.connect(transport)
      await transport.handleRequest(req, res)
    } catch (err) {
      console.error('[payload-mcp stub] request failed', err)
      if (!res.headersSent) res.writeHead(500).end()
    }
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}
