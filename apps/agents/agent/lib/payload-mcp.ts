import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { z } from 'zod'
import { getEnv } from './env'

/** Upper bound for connecting and for each tool call, so a stalled CMS can't hang a turn. */
export const PAYLOAD_MCP_TIMEOUT_MS = 5_000

/**
 * Calls one Payload MCP custom tool (official MCP TypeScript SDK, Streamable HTTP) and validates
 * its JSON text result. A connection per call keeps it stateless; the corpus call dominates.
 */
export async function callPayloadTool<S extends z.ZodType>(
  name: 'twinIdentity' | 'twinSearch' | 'twinDisclose',
  args: Record<string, unknown>,
  schema: S,
): Promise<z.infer<S>> {
  const env = getEnv()
  const client = new Client({ name: 'portfolio-twin', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(env.PAYLOAD_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${env.PAYLOAD_MCP_API_KEY}` } },
  })
  try {
    await client.connect(transport, { timeout: PAYLOAD_MCP_TIMEOUT_MS })
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: PAYLOAD_MCP_TIMEOUT_MS })
    if (result.isError) throw new Error(`Payload MCP ${name} failed: ${JSON.stringify(result.content)}`)
    const text = (result.content as Array<{ type: string; text?: string }>).find((c) => c.type === 'text')?.text
    if (text === undefined) throw new Error(`Payload MCP ${name} returned no text content`)
    return schema.parse(JSON.parse(text))
  } finally {
    await client.close()
  }
}
