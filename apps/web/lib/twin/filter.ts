// Verified against eve 0.71.0 dist/src/client/message-reducer.js + message-run-parts.js: `message.completed` sets the text part to `data.message`, replacing the streamed deltas, so the held-back tail can ride in the completed event.
// Verified against dist/src/client/url.js + shared/eve-route-path.js: an absolute `host` keeps its path, so `${origin}/api/twin` resolves to `/api/twin/eve/v1/...`.
import { LEAK_DEFLECTION } from '@repo/twin/contract'
import { escapeRegExp, redactText, StreamRedactor, type RedactionRules } from '@repo/twin/redact'
import { z } from 'zod'

type Data = Record<string, unknown>
const isData = (v: unknown): v is Data => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * One eve stream event (NDJSON line): any record with a string `type`, as that is all eve's client
 * needs to render it. Nothing else is validated, so no malformed field can exempt an event from
 * filtering: `meta` is never checked (the client only reads `meta?.id`), and a `data` that is not a
 * record (absent, null, an array, a scalar) becomes `{}`, since the filter cannot tell which of its
 * content is safe. Only `data` content is ever rewritten; other keys pass through.
 */
export const StreamEvent = z.looseObject({
  type: z.string(),
  data: z.unknown().transform((d): Data => (isData(d) ? d : {})),
})
export type StreamEvent = z.output<typeof StreamEvent>

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
 * Error messages are blanked for every tool, schedule_call included: only its successful output shows.
 */
const isVisibleAction = (a: Data) => (a.kind === 'tool-call' || a.kind === 'workflow-tool-call') && a.toolName === VISIBLE_TOOL
const isVisibleResult = (r: Data) => r.kind === 'tool-result' && r.toolName === VISIBLE_TOOL
const asData = (v: unknown): Data => (isData(v) ? v : {})

/** A request with its input blanked, unless it belongs to the visible tool. */
const blankAction = (a: Data): Data => (isVisibleAction(a) ? a : { ...a, input: null })
/** An error with its message blanked; keys absent from the original stay absent. */
const blankError = (d: Data): Data => (d.error === undefined ? {} : { error: { ...asData(d.error), message: '' } })

/**
 * Failure text (`turn.failed`, `step.failed`, `session.failed`) can carry provider or SQL errors:
 * only `code` reaches the browser. Keys absent from the original stay absent.
 */
const blankFailure = (d: Data): Data => ({ ...d, ...('message' in d ? { message: '' } : {}), ...('details' in d ? { details: undefined } : {}) })

/**
 * A `session-limit` request asks to raise the session's budget: the visitor can never answer it,
 * so its prompt and options (which name the spend) are blanked.
 */
const isSessionLimit = (q: Data) => q.kind === 'session-limit'
const blankRequest = (q: Data): Data => ({
  ...q,
  ...(isSessionLimit(q) ? { ...('prompt' in q ? { prompt: '' } : {}), ...('options' in q ? { options: [] } : {}) } : {}),
  action: blankAction(asData(q.action)),
})

export interface EventFilterHooks {
  /** Called once per filter when a `session-limit` request passes: the conversation is over. */
  onSessionLimit?: () => void
}

/**
 * The output boundary (spec §10). Redacts never-tier terms, PII and the prompt canary from
 * assistant text, independent of what the model produced, and blanks reasoning, tool payloads,
 * failure details, token usage and model ids (`stripModel`: the boundaries forbid revealing models or
 * providers, and with routing a model id would reveal the tier). Never drops or adds events: clients
 * resume by absolute event index.
 */
export function createEventFilter(rules: RedactionRules, canary: string, hooks: EventFilterHooks = {}): (e: StreamEvent) => StreamEvent {
  const withCanary: RedactionRules = { terms: [...rules.terms, canary], allow: rules.allow }
  // The redactor's own term matching (trimmed, escaped, Unicode case folding), so `ſ` counts as `s` here too.
  const canaryPattern = new RegExp(escapeRegExp(canary.trim()), 'iu')
  const hasCanary = (text: string) => canaryPattern.test(text)
  /*
   * Per text block: its redactor, the raw tail that might hold the start of a split canary, and
   * whether the canary has appeared. The canary is the first line of the system prompt, so seeing
   * it means the model is dumping the prompt: every later delta of that block is blanked, not just
   * the canary itself, and `message.completed` carries the deflection. The redactor holds back at
   * least the canary's length, so no part of it, nor anything after it, was emitted before the
   * raw text reveals it.
   */
  const blocks = new Map<string, { redactor: StreamRedactor; tail: string; leaked: boolean }>()
  /*
   * Steps whose `step.started` this filter saw. eve emits `step.started` before the step's first
   * `message.appended` (harness/tool-loop.js, harness/step-hooks.js). A stream resumed mid-block
   * starts without it: the redactor would begin mid-sentence (a term split across the cut, or a
   * held-back tail, would stream unredacted), so that block's deltas are blanked and its
   * `message.completed`, which replaces the streamed text, carries it fully redacted.
   */
  const started = new Set<string>()
  let sessionLimitSeen = false
  const keyOf = (d: Data) => `${String(d.turnId)}:${String(d.stepIndex)}`
  const rewrite = (e: StreamEvent, data: Data): StreamEvent => ({ ...e, data })

  const filterContent = (e: StreamEvent): StreamEvent => {
    const d = e.data
    switch (e.type) {
      case 'step.started':
        started.add(keyOf(d))
        return e
      case 'message.appended': {
        if (typeof d.messageDelta !== 'string') return e
        const key = keyOf(d)
        if (!started.has(key)) return rewrite(e, { ...d, messageDelta: '' })
        const block = blocks.get(key) ?? { redactor: new StreamRedactor(withCanary), tail: '', leaked: false }
        blocks.set(key, block)
        if (block.leaked) return rewrite(e, { ...d, messageDelta: '' })
        const raw = block.tail + d.messageDelta
        if (hasCanary(raw)) {
          block.leaked = true
          return rewrite(e, { ...d, messageDelta: '' })
        }
        block.tail = raw.slice(Math.max(0, raw.length - canary.length + 1))
        return rewrite(e, { ...d, messageDelta: block.redactor.push(d.messageDelta) })
      }
      case 'message.completed': {
        if (typeof d.message !== 'string') return e
        const key = keyOf(d)
        const leaked = blocks.get(key)?.leaked === true || hasCanary(d.message)
        blocks.delete(key)
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
      case 'input.requested': {
        if (!Array.isArray(d.requests)) return e
        const requests = d.requests.map(asData)
        if (!sessionLimitSeen && requests.some(isSessionLimit)) {
          sessionLimitSeen = true
          hooks.onSessionLimit?.()
        }
        return rewrite(e, { ...d, requests: requests.map(blankRequest) })
      }
      case 'action.partial':
      case 'action.result': {
        // Only schedule_call's successful output is visible; every error message is blanked.
        const result = asData(d.result)
        return rewrite(e, { ...d, ...(isVisibleResult(result) ? {} : { result: { ...result, output: null } }), ...blankError(d) })
      }
      case 'task.settled':
        return rewrite(e, { ...d, ...(d.name !== VISIBLE_TOOL && 'output' in d ? { output: null } : {}), ...blankError(d) })
      case 'turn.failed':
      case 'step.failed':
      case 'session.failed':
        return rewrite(e, blankFailure(d))
      default:
        return e
    }
  }

  return (e) => {
    // Only reachable by callers that skip `StreamEvent` parsing, which guarantees a `data` record.
    if (!isData(e.data)) return e
    const out = filterContent(e)
    const data = stripUsage(stripModel(out.data))
    return data === out.data ? out : { ...out, data }
  }
}

/**
 * Token counts and spend (`usage` on `session.waiting`, `turn.waiting`, `session.completed`,
 * `session.failed`, `step.completed`; `usageInputTokens` on `compaction.requested`;
 * `providerMetadata` on `step.completed`, which carries OpenRouter usage and cost) are the
 * operator's business. Stripped from any event that has the key. Only keys present on the original
 * are touched, so no shape changes.
 */
function stripUsage(d: Data): Data {
  if (!('usage' in d) && !('usageInputTokens' in d) && !('providerMetadata' in d)) return d
  return {
    ...d,
    ...('usage' in d ? { usage: undefined } : {}),
    ...('usageInputTokens' in d ? { usageInputTokens: null } : {}),
    ...('providerMetadata' in d ? { providerMetadata: undefined } : {}),
  }
}

/**
 * Model ids (`modelId` on `step.started`, `compaction.requested` and `compaction.completed`) name the
 * provider and, with routing, the tier. Stripped from any event that has the key, not a fixed list of
 * types, so an event type eve adds later cannot leak one. Only keys present on the original are touched.
 */
function stripModel(d: Data): Data {
  if (!('modelId' in d) && !('model' in d)) return d
  return { ...d, ...('modelId' in d ? { modelId: undefined } : {}), ...('model' in d ? { model: undefined } : {}) }
}

/**
 * A record without a string `type` is not an event eve's client can render, so it passes, keeping
 * one line out per line in (clients resume by absolute event index). Its `data` still loses what
 * needs no `type` to recognise: usage and spend, model ids, and `message` / `details` text.
 */
function filterUntyped(record: unknown): unknown {
  if (!isData(record) || !isData(record.data)) return record
  return { ...record, data: stripUsage(stripModel(blankFailure(record.data))) }
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
      const record: unknown = JSON.parse(value)
      // `$eve` control records (lease ended) are transport and pass verbatim. Every record with a
      // string `type` is filtered, whatever else it holds; any other record is never dropped (see
      // `filterUntyped`), so one line still goes out per line in.
      if (isData(record) && '$eve' in record) return controller.enqueue(encoder.encode(`${value}\n`))
      const event = StreamEvent.safeParse(record)
      if (!event.success) {
        const out = filterUntyped(record)
        return controller.enqueue(encoder.encode(`${out === record ? value : JSON.stringify(out)}\n`))
      }
      controller.enqueue(encoder.encode(`${JSON.stringify(filter(event.data))}\n`))
    },
    async cancel() {
      await lines.return(undefined)
    },
  })
}
