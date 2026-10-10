import { describe, expect, it } from 'vitest'
import { mcpEventToCapture } from '../../src/mcp/observability'

const TRACE = '0af7651916cd43dd8448eb211c80319c'
const SPAN = 'b7ad6b7169203331'

/** mcp-handler 1.1 puts the whole JSON-RPC request in `result` of REQUEST_COMPLETED (there is no `parameters`). */
const rpc = (params: unknown, method = 'tools/call') => ({ jsonrpc: '2.0', id: 1, method, params })

describe('mcpEventToCapture', () => {
  it('turns a completed tools/call into an $ai_span joined to the caller trace', () => {
    const c = mcpEventToCapture({
      type: 'REQUEST_COMPLETED', timestamp: 0, sessionId: 'mcp-s', requestId: 'r1', method: 'tools/call', status: 'success', duration: 120,
      result: rpc({ name: 'twinSearch', arguments: { query: 'react' }, _meta: { traceparent: `00-${TRACE}-${SPAN}-01` } }),
    })
    expect(c).toEqual({
      distinctId: 'mcp:payload',
      event: '$ai_span',
      properties: {
        $ai_trace_id: TRACE,
        $ai_parent_id: SPAN,
        $ai_span_name: 'mcp tools/call twinSearch',
        $ai_session_id: 'mcp-s',
        $ai_latency: 0.12,
        $ai_is_error: false,
        $ai_input_state: { query: 'react' },
        mcp_tool: 'twinSearch',
      },
    })
  })

  it('also reads `parameters` when an emit site provides them', () => {
    const c = mcpEventToCapture({ type: 'REQUEST_COMPLETED', timestamp: 0, requestId: 'r0', method: 'tools/call', status: 'success', parameters: { name: 'twinSearch', arguments: {} } })
    expect(c?.properties).toMatchObject({ mcp_tool: 'twinSearch' })
  })

  it('uses the MCP session (or request) as its own trace without a traceparent, and flags errors', () => {
    const c = mcpEventToCapture({ type: 'REQUEST_COMPLETED', timestamp: 0, requestId: 'r2', method: 'tools/call', status: 'error', result: rpc({ name: 'twinDisclose', arguments: {} }) })
    expect(c?.properties).toMatchObject({ $ai_trace_id: 'mcp-r2', $ai_is_error: true })
    expect(c?.properties).not.toHaveProperty('$ai_parent_id')
  })

  it('truncates large inputs', () => {
    const c = mcpEventToCapture({ type: 'REQUEST_COMPLETED', timestamp: 0, requestId: 'r3', method: 'tools/call', status: 'success', result: rpc({ name: 'x', arguments: { body: 'y'.repeat(20_000) } }) })
    expect(String(c?.properties.$ai_input_state).length).toBeLessThanOrEqual(8_192 + 20)
  })

  it('counts other methods as mcp_request and ignores received/session events', () => {
    expect(mcpEventToCapture({ type: 'REQUEST_COMPLETED', timestamp: 0, method: 'tools/list', status: 'success' })).toEqual({ distinctId: 'mcp:payload', event: 'mcp_request', properties: { method: 'tools/list', status: 'success' } })
    expect(mcpEventToCapture({ type: 'REQUEST_RECEIVED', timestamp: 0, method: 'tools/call', status: 'success' })).toBeNull()
    expect(mcpEventToCapture({ type: 'SESSION_STARTED', timestamp: 0, transport: 'HTTP' })).toBeNull()
  })
})
