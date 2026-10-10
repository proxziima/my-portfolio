import type { Context } from '@opentelemetry/api'
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { PostHogSpanProcessor } from '@posthog/ai/otel'
import { posthogConfig } from '@repo/observability/config'
import { fetchRedactionRules, redactText, type RedactionRules } from '@repo/twin/redact'
import type { SpanExportPolicy } from 'eve/instrumentation/otel'
import { getEnv } from '../env'
import { ttlCache } from '../ttl-cache'

type Redactor = (text: string) => string

/**
 * Attribute keys that may carry prompts, replies or tool payloads beyond eve's own content set
 * (third-party and twin spans); dropped while the redaction rules are not loaded.
 */
const CONTENT_KEY = /prompt|message|response|instruction|input|output|args|arguments|result|content|text/i

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

/**
 * The destination's export policy: every string attribute passes through the redactor (the same
 * rules as the stored transcripts), so PostHog holds nothing the twin's own database wouldn't.
 * While the rules are unavailable the redactor is null: eve strips its content attributes from the
 * span and other content-like strings are dropped, never sent raw. A disabled destination costs
 * nothing and never fetches the rules.
 */
export function redactionPolicy(redactor: () => Redactor | null, enabled: () => boolean): SpanExportPolicy {
  return {
    span: () => (!enabled() || redactor() ? { emit: true } : { redact: true, inputs: true, outputs: true }),
    attribute: ({ key, value }) => {
      const isText = typeof value === 'string' || (Array.isArray(value) && value.some((v) => typeof v === 'string'))
      if (!isText || !enabled()) return { emit: true }
      const redact = redactor()
      if (!redact) return { emit: !CONTENT_KEY.test(key) }
      if (typeof value === 'string') return { replace: true, value: redact(value) }
      // OTel arrays are homogeneous apart from null holes, which the export value type can't carry.
      return { replace: true, value: (value as unknown[]).filter((v): v is string => typeof v === 'string').map(redact) }
    },
  }
}

let rules: RedactionRules | null = null
const loadRules = ttlCache(() => fetchRedactionRules(getEnv().CMS_URL, getEnv().TWIN_REDACT_SECRET), 5 * 60_000)

/** Refreshes the rules in the background (TTL-cached, one fetch in flight); a failure keeps the last good rules. */
const refreshRules = () => {
  loadRules().then(
    (next) => {
      rules = next
    },
    () => {},
  )
}

/** The current redactor: the CMS rules plus the prompt canary; null until the rules first load. */
function currentRedactor(): Redactor | null {
  refreshRules()
  if (!rules) return null
  const loaded = rules
  const canary = getEnv().TWIN_PROMPT_CANARY
  return (text) => redactText(text, loaded).split(canary).join('[canary]')
}

let config: ReturnType<typeof posthogConfig> | undefined
/** The PostHog settings, read once on first use (never at module load: no env at build time). */
const postHog = () => (config === undefined ? (config = posthogConfig()) : config)

/** The PostHog LLM-analytics destination: lazy, redacted, and a no-op without a token. */
export function postHogDestination(): { spanProcessors: SpanProcessor[]; exportPolicy: SpanExportPolicy } {
  return {
    spanProcessors: [
      lazyProcessor(() => {
        const c = postHog()
        if (!c) return null
        refreshRules() // prefetch, so the first turn's content isn't held back
        return new PostHogSpanProcessor({ projectToken: c.token, host: c.ingestHost })
      }),
    ],
    exportPolicy: redactionPolicy(currentRedactor, () => postHog() !== null),
  }
}
