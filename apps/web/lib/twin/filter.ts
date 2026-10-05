// Verified against eve 0.71.0 dist/src/client/message-reducer.js + message-run-parts.js: `message.completed` sets the text part to `data.message`, replacing the streamed deltas, so the held-back tail can ride in the completed event.
// Verified against dist/src/client/url.js + shared/eve-route-path.js: an absolute `host` keeps its path, so `${origin}/api/twin` resolves to `/api/twin/eve/v1/...`.
import { LEAK_DEFLECTION } from '@repo/twin/contract'
import { redactText, StreamRedactor, type RedactionRules } from '@repo/twin/redact'

/** One eve stream event (NDJSON line). Only `data` content is ever rewritten. */
export interface StreamEvent {
  type: string
  data: Record<string, unknown>
  meta: Record<string, unknown>
}

type Data = Record<string, unknown>

/** Only the booking dialog's payload reaches the browser; other tool I/O is the agent's business. */
const VISIBLE_TOOL = 'schedule_call'

/*
 * Where tool payloads live (eve 0.71 dist/src/protocol/message.d.ts, shared/action-types.d.ts).
 * Every carrier names its tool, so no callId -> toolName tracking is needed; a missing name blanks.
 * - action.input.appended: data.toolName, data.inputTextDelta
 * - actions.requested: data.actions[].toolName (tool-call kinds only), data.actions[].input
 * - input.requested: data.requests[].action.{toolName,input}
 * - action.partial / action.result: data.result.{toolName (tool-result only), output}, data.error.message
 * - task.settled: data.name, data.output, data.error.message
 */
const isVisibleAction = (a: Data) => (a.kind === 'tool-call' || a.kind === 'workflow-tool-call') && a.toolName === VISIBLE_TOOL
const isVisibleResult = (r: Data) => r.kind === 'tool-result' && r.toolName === VISIBLE_TOOL
const asData = (v: unknown): Data => (typeof v === 'object' && v !== null ? (v as Data) : {})

/** A request with its input blanked, unless it belongs to the visible tool. */
const blankAction = (a: Data): Data => (isVisibleAction(a) ? a : { ...a, input: null })
/** An error with its message blanked; keys absent from the original stay absent. */
const blankError = (d: Data): Data => (d.error === undefined ? {} : { error: { ...asData(d.error), message: '' } })

/**
 * The output boundary (spec §10). Redacts never-tier terms, PII and the prompt canary from
 * assistant text, independent of what the model produced, and blanks reasoning and tool payloads.
 * Never drops or adds events: clients resume by absolute event index.
 */
export function createEventFilter(rules: RedactionRules, canary: string): (e: StreamEvent) => StreamEvent {
  const withCanary: RedactionRules = { terms: [...rules.terms, canary], allow: rules.allow }
  const redactors = new Map<string, StreamRedactor>()
  const keyOf = (d: Data) => `${String(d.turnId)}:${String(d.stepIndex)}`
  const rewrite = (e: StreamEvent, data: Data): StreamEvent => ({ ...e, data })

  return (e) => {
    const d = e.data
    switch (e.type) {
      case 'message.appended': {
        if (typeof d.messageDelta !== 'string') return e
        const key = keyOf(d)
        const r = redactors.get(key) ?? new StreamRedactor(withCanary)
        redactors.set(key, r)
        return rewrite(e, { ...d, messageDelta: r.push(d.messageDelta) })
      }
      case 'message.completed': {
        if (typeof d.message !== 'string') return e
        redactors.delete(keyOf(d))
        const leaked = d.message.includes(canary)
        if (leaked) console.warn(`[twin] canary leak blocked in turn ${String(d.turnId)}`)
        return rewrite(e, { ...d, message: leaked ? LEAK_DEFLECTION : redactText(d.message, withCanary) })
      }
      case 'reasoning.appended':
        return rewrite(e, { ...d, reasoningDelta: '' })
      case 'reasoning.completed':
        return rewrite(e, { ...d, reasoning: '' })
      case 'action.input.appended':
        return d.toolName === VISIBLE_TOOL ? e : rewrite(e, { ...d, inputTextDelta: '' })
      case 'actions.requested':
        return Array.isArray(d.actions) ? rewrite(e, { ...d, actions: d.actions.map((a) => blankAction(asData(a))) }) : e
      case 'input.requested':
        return Array.isArray(d.requests)
          ? rewrite(e, { ...d, requests: d.requests.map((q) => ({ ...asData(q), action: blankAction(asData(asData(q).action)) })) })
          : e
      case 'action.partial':
      case 'action.result': {
        const result = asData(d.result)
        return isVisibleResult(result) ? e : rewrite(e, { ...d, result: { ...result, output: null }, ...blankError(d) })
      }
      case 'task.settled':
        return d.name === VISIBLE_TOOL ? e : rewrite(e, { ...d, ...('output' in d ? { output: null } : {}), ...blankError(d) })
      default:
        return e
    }
  }
}

/** Splits a byte stream into NDJSON lines (including blank and `$eve` control lines). */
export async function* ndjsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) {
        buffer += decoder.decode()
        break
      }
      buffer += decoder.decode(value, { stream: true })
      let nl = buffer.indexOf('\n')
      while (nl >= 0) {
        yield buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
      }
    }
    if (buffer.length > 0) yield buffer
  } finally {
    // Reached on early return too (client disconnect), so the upstream body is released.
    await reader.cancel().catch(() => undefined)
  }
}

/** Applies the filter to an NDJSON body, line by line, preserving control lines and order. */
export function filterStream(body: ReadableStream<Uint8Array>, filter: (e: StreamEvent) => StreamEvent): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const lines = ndjsonLines(body)
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await lines.next()
      if (done) return controller.close()
      if (value.trim() === '') return controller.enqueue(encoder.encode(`${value}\n`))
      const record = JSON.parse(value) as Record<string, unknown>
      // `$eve` control records (lease ended) are transport, not events: they pass verbatim.
      if ('$eve' in record) return controller.enqueue(encoder.encode(`${value}\n`))
      controller.enqueue(encoder.encode(`${JSON.stringify(filter(record as unknown as StreamEvent))}\n`))
    },
    async cancel() {
      await lines.return(undefined)
    },
  })
}
