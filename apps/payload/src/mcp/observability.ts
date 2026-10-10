import { captureServerError, serverPostHog } from '@repo/observability/server'

/** mcp-handler 1.1's `onEvent` payload (its `McpEvent` union isn't exported from the package root). */
type McpEvent =
  | { type: 'SESSION_STARTED' | 'SESSION_ENDED'; timestamp: number; sessionId?: string; transport: 'SSE' | 'HTTP' }
  | { type: 'REQUEST_RECEIVED' | 'REQUEST_COMPLETED'; timestamp: number; sessionId?: string; requestId?: string; method: string; parameters?: unknown; result?: unknown; duration?: number; status: 'success' | 'error' }
  | { type: 'ERROR'; timestamp: number; sessionId?: string; requestId?: string; error: Error | string; context?: string; source: string; severity: string }

type ToolCallParams = { name?: string; arguments?: unknown; _meta?: { traceparent?: string } }

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/

/** Argument names only, sorted: values can hold visitor text, which the agent side redacts but this process can't. */
const argumentKeys = (args: unknown): string[] => (args && typeof args === 'object' ? Object.keys(args).sort() : [])

/**
 * The tools/call params. mcp-handler 1.1 emits REQUEST_COMPLETED with no `parameters`: its `result`
 * is the JSON-RPC request body itself, so the params live at `result.params`.
 */
const paramsOf = (event: Extract<McpEvent, { type: 'REQUEST_RECEIVED' | 'REQUEST_COMPLETED' }>): ToolCallParams => {
  const body = event.result as { params?: ToolCallParams } | undefined
  return (event.parameters ?? body?.params ?? {}) as ToolCallParams
}

/**
 * The PostHog event for one MCP event, or null when it isn't reported. A `tools/call` becomes an
 * `$ai_span`; with the caller's `_meta.traceparent` (the twin sends one) it nests under the
 * caller's trace, otherwise the MCP session or request is its own trace (Claude Code, other clients).
 * mcp-handler 1.1's `onEvent` sees neither the tool output nor tool-level `isError` (the twin's own
 * `tools/call` span traces those client-side), and argument values are never recorded, only names.
 */
export function mcpEventToCapture(event: McpEvent): { distinctId: string; event: string; properties: Record<string, unknown> } | null {
  if (event.type !== 'REQUEST_COMPLETED') return null
  if (event.method !== 'tools/call') return { distinctId: 'mcp:payload', event: 'mcp_request', properties: { method: event.method, status: event.status } }
  const params = paramsOf(event)
  const parent = TRACEPARENT.exec(params._meta?.traceparent ?? '')
  const tool = params.name ?? 'unknown'
  const keys = argumentKeys(params.arguments)
  return {
    distinctId: 'mcp:payload',
    event: '$ai_span',
    properties: {
      $ai_trace_id: parent?.[1] ?? `mcp-${event.sessionId ?? event.requestId ?? event.timestamp}`,
      ...(parent ? { $ai_parent_id: parent[2] } : {}),
      $ai_span_name: `mcp tools/call ${tool}`,
      ...(event.sessionId ? { $ai_session_id: event.sessionId } : {}),
      ...(event.duration !== undefined ? { $ai_latency: event.duration / 1000 } : {}),
      $ai_is_error: event.status === 'error',
      $ai_input_state: { keys },
      mcp_input_keys: keys,
      mcp_tool: tool,
    },
  }
}

/** `mcp.handlerOptions.onEvent`: reports MCP traffic and errors; never throws into the handler. The plugin types the event as `unknown`, so the McpEvent shape is asserted here. */
export function mcpOnEvent(raw: unknown): void {
  const event = raw as McpEvent
  try {
    if (event.type === 'ERROR') {
      captureServerError(event.error instanceof Error ? event.error : new Error(String(event.error)), {
        distinctId: 'mcp:payload',
        properties: { source: event.source, severity: event.severity, context: event.context },
      })
      return
    }
    const capture = mcpEventToCapture(event)
    if (capture) serverPostHog().capture(capture)
  } catch (error) {
    console.warn('[mcp] observability failed', error instanceof Error ? error.message : error)
  }
}
