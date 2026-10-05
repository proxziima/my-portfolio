import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const m = vi.hoisted(() => ({ result: null as unknown, close: vi.fn(async () => {}) }))
vi.mock('../agent/lib/env', () => ({ getEnv: () => ({ PAYLOAD_MCP_URL: 'https://cms.test/api/mcp', PAYLOAD_MCP_API_KEY: 'k' }) }))
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({ StreamableHTTPClientTransport: class {} }))
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    async connect() {}
    async callTool() {
      return m.result
    }
    close = m.close
  },
}))

const { callPayloadTool } = await import('../agent/lib/payload-mcp')
const Schema = z.object({ ok: z.boolean() })

beforeEach(() => m.close.mockClear())

describe('callPayloadTool', () => {
  it('validates the JSON text content against the schema', async () => {
    m.result = { content: [{ type: 'image', data: 'x' }, { type: 'text', text: '{"ok":true}' }] }
    await expect(callPayloadTool('twinSearch', {}, Schema)).resolves.toEqual({ ok: true })
    expect(m.close).toHaveBeenCalledTimes(1)
  })

  it('rejects content that is not a list of content blocks, and still closes', async () => {
    m.result = { content: 'not a list' }
    await expect(callPayloadTool('twinSearch', {}, Schema)).rejects.toThrow(/twinSearch returned malformed content/)
    expect(m.close).toHaveBeenCalledTimes(1)
  })

  it('rejects a result with no text block', async () => {
    m.result = { content: [{ type: 'image', data: 'x' }] }
    await expect(callPayloadTool('twinIdentity', {}, Schema)).rejects.toThrow(/returned no text content/)
  })
})
