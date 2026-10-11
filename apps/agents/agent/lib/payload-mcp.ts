import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { z } from 'zod'
import { getEnv } from './env'
import { inSpan, traceMeta } from './observability/spans'

/** Upper bound for connecting and for each tool call, so a stalled CMS can't hang a turn. */
export const PAYLOAD_MCP_TIMEOUT_MS = 5_000

/** A tool result's content blocks; only text blocks are read, others pass untouched. */
const Content = z.array(z.looseObject({ type: z.string(), text: z.string().optional() }))

/**
 * Calls one Payload MCP custom tool (official MCP TypeScript SDK, Streamable HTTP) and validates
 * its JSON text result. A connection per call keeps it stateless; the corpus call dominates.
 * Each call is one `tools/call` span whose W3C traceparent rides in `_meta`, so the server's span
 * joins the twin's trace.
 */
export async function callPayloadTool<S extends z.ZodType>(
  name: 'twinIdentity' | 'twinSearch' | 'twinDisclose',
  args: Record<string, unknown>,
  schema: S,
): Promise<z.infer<S>> {
  const env = getEnv()
  // Ids and labels only: the arguments and the result stay off the span, whatever the redaction state.
  const attributes = { 'mcp.method.name': 'tools/call', 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': name }
  return inSpan(`tools/call ${name}`, attributes, async (span) => {
    const client = new Client({ name: 'portfolio-twin', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(env.PAYLOAD_MCP_URL), {
      requestInit: { headers: { Authorization: `Bearer ${env.PAYLOAD_MCP_API_KEY}` } },
    })
    try {
      await client.connect(transport, { timeout: PAYLOAD_MCP_TIMEOUT_MS })
      if (transport.sessionId) span.setAttribute('mcp.session.id', transport.sessionId)
      const meta = traceMeta()
      const result = await client.callTool({ name, arguments: args, ...(meta ? { _meta: meta } : {}) }, undefined, { timeout: PAYLOAD_MCP_TIMEOUT_MS })
      // Fixed wording: the tool's content can echo visitor text, and this message becomes exception text in Error Tracking.
      if (result.isError) throw new Error(`Payload MCP ${name} failed`)
      const content = Content.safeParse(result.content)
      if (!content.success) throw new Error(`Payload MCP ${name} returned malformed content`)
      const text = content.data.find((c) => c.type === 'text')?.text
      if (text === undefined) throw new Error(`Payload MCP ${name} returned no text content`)
      return schema.parse(JSON.parse(text))
    } finally {
      await client.close()
    }
  })
}
