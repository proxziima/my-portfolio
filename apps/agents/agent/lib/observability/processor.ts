import type { Context } from '@opentelemetry/api'
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { PostHogSpanProcessor } from '@posthog/ai/otel'
import { posthogConfig, type PostHogConfig } from '@repo/observability/config'
import { fetchRedactionRules, redactText, type RedactionRules } from '@repo/twin/redact'
import type { SpanExportPolicy } from 'eve/instrumentation/otel'
import { getEnv } from '../env'

export type Redactor = (text: string) => string

/**
 * Attribute keys that may carry prompts, replies or tool payloads beyond eve's own content set
 * (third-party and twin spans); dropped while the redaction rules are not loaded.
 */
const CONTENT_KEY = /prompt|message|response|instruction|input|output|args|arguments|result|content|text/i

/**
 * Identity and correlation ids, sent as-is: they carry no visitor content, and the PII rules would
 * mangle them (the phone pattern matches the digit runs of many UUIDs), breaking the PostHog joins.
 * An explicit list rather than every `*.id`, so a new id-shaped attribute is redacted until vetted.
 */
export const IDENTITY_KEYS: readonly string[] = [
  'ai.settings.context.distinctId',
  'ai.settings.context.sessionId',
  'ai.settings.context.$session_id',
  'gen_ai.conversation.id',
  'agent.principal.current.id',
  'agent.principal.initiator.id',
  'agent.run.id',
  'agent.turn.id',
  'agent.parent_run.id',
  'mcp.session.id',
]
const IDENTITY = new Set(IDENTITY_KEYS)

/** The transcript's redaction plus the prompt canary, scrubbed first so an overlapping redaction can't split it. */
export function makeRedactor(rules: RedactionRules, canary: string): Redactor {
  return (text) => redactText(text.split(canary).join('[canary]'), rules)
}

/** A span processor built on first use: eve evaluates instrumentation modules at build time, without env. */
export function lazyProcessor(create: () => SpanProcessor | null): SpanProcessor {
  let resolved: SpanProcessor | null | undefined
  const get = () => (resolved === undefined ? (resolved = create()) : resolved)
  return {
    onStart: (span: Span, parent: Context) => get()?.onStart(span, parent),
    onEnd: (span: ReadableSpan) => get()?.onEnd(span),
    forceFlush: async () => {
      await get()?.forceFlush()
    },
    shutdown: async () => {
      await get()?.shutdown()
    },
  }
}

const isText = (value: unknown) => typeof value === 'string' || (Array.isArray(value) && value.some((v) => typeof v === 'string'))

/** A text value through the redactor. OTel arrays are homogeneous apart from null holes, which an export value can't carry. */
const redactValue = (value: unknown, redact: Redactor): string | string[] =>
  typeof value === 'string' ? redact(value) : (value as unknown[]).filter((v): v is string => typeof v === 'string').map(redact)

/**
 * The destination's export policy: every string attribute passes through the redactor (the same
 * rules as the stored transcripts), so PostHog holds nothing the twin's own database wouldn't.
 * While the rules are unavailable the redactor is null: eve strips its content attributes from the
 * span and other content-like strings are dropped, never sent raw. Identity ids pass untouched.
 * A disabled destination costs nothing and never fetches the rules.
 */
export function redactionPolicy(redactor: () => Redactor | null, enabled: () => boolean): SpanExportPolicy {
  return {
    span: () => (!enabled() || redactor() ? { emit: true } : { redact: true, inputs: true, outputs: true }),
    attribute: ({ key, value }) => {
      if (!isText(value) || IDENTITY.has(key) || !enabled()) return { emit: true }
      const redact = redactor()
      return redact ? { replace: true, value: redactValue(value, redact) } : { emit: !CONTENT_KEY.test(key) }
    },
  }
}

/**
 * eve's export policy never sees span events (exception messages and stack traces) or the status
 * message, so this processor, beneath the policy, redacts those, or drops their strings while the
 * rules are unavailable. It forwards a prototype-linked view: every other member stays the span's.
 */
export function redactingEventsProcessor(inner: SpanProcessor, redactor: () => Redactor | null): SpanProcessor {
  return {
    onStart: (span, parent) => inner.onStart(span, parent),
    onEnd: (span) => {
      const redact = redactor()
      const clean = (attributes: Record<string, unknown>) => {
        const out: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(attributes)) {
          if (!isText(value) || IDENTITY.has(key)) out[key] = value
          else if (redact) out[key] = redactValue(value, redact)
        }
        return out
      }
      const events = span.events.map((e) => (e.attributes ? { ...e, attributes: clean(e.attributes) } : e))
      const { message, ...status } = span.status
      const statusOut = message === undefined ? span.status : redact ? { ...status, message: redact(message) } : status
      inner.onEnd(Object.create(span, { events: { value: events, enumerable: true }, status: { value: statusOut, enumerable: true } }) as ReadableSpan)
    },
    forceFlush: () => inner.forceFlush(),
    shutdown: () => inner.shutdown(),
  }
}

/** How often the background refresh asks for the rules; `fetchRedactionRules` itself caches for five minutes. */
const REFRESH_EVERY_MS = 10_000
let redactor: Redactor | null = null
let refreshing = false
let refreshedAt = -Infinity

/**
 * Refreshes the redactor in the background, one request at a time. A rejection means the rules are
 * gone or older than `fetchRedactionRules` will serve, so content is held back again, as on the
 * transcript path.
 */
function refreshRules(): void {
  if (refreshing || Date.now() - refreshedAt < REFRESH_EVERY_MS) return
  refreshing = true
  refreshedAt = Date.now()
  fetchRedactionRules(getEnv().CMS_URL, getEnv().TWIN_REDACT_SECRET)
    .then(
      (rules) => {
        redactor = makeRedactor(rules, getEnv().TWIN_PROMPT_CANARY)
      },
      () => {
        redactor = null
      },
    )
    .finally(() => {
      refreshing = false
    })
}

/** The current redactor (null until the rules first load), kicking off a refresh when one is due. */
function currentRedactor(): Redactor | null {
  refreshRules()
  return redactor
}

let config: { value: PostHogConfig | null } | { error: unknown } | undefined
/** The PostHog settings, read once on first use (never at module load: no env at build time); a bad region rethrows every time. */
function postHog(): PostHogConfig | null {
  if (config === undefined) {
    try {
      config = { value: posthogConfig() }
    } catch (error) {
      config = { error }
    }
  }
  if ('error' in config) throw config.error
  return config.value
}

interface DestinationDeps {
  config: () => Pick<PostHogConfig, 'token' | 'ingestHost'> | null
  redactor: () => Redactor | null
  exporter: (config: Pick<PostHogConfig, 'token' | 'ingestHost'>) => SpanProcessor
}

const defaults: DestinationDeps = {
  config: postHog,
  redactor: currentRedactor,
  exporter: (c) => new PostHogSpanProcessor({ projectToken: c.token, host: c.ingestHost }),
}

/** The PostHog LLM-analytics destination: lazy, redacted (attributes, events, status), and a no-op without a token. */
export function postHogDestination(deps: DestinationDeps = defaults): { spanProcessors: SpanProcessor[]; exportPolicy: SpanExportPolicy } {
  return {
    spanProcessors: [
      lazyProcessor(() => {
        const c = deps.config()
        if (!c) return null
        deps.redactor() // starts the first rules fetch; spans ending before it lands have their content held back
        return redactingEventsProcessor(deps.exporter(c), deps.redactor)
      }),
    ],
    exportPolicy: redactionPolicy(deps.redactor, () => deps.config() !== null),
  }
}
