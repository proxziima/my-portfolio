import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { MODEL_DEFAULTS } from '@repo/twin/env'

/** Model ids resolved from env with the shared defaults; safe at build time (no required vars). */
export function modelIds(env: Record<string, string | undefined>): { primary: string; chain: string[]; classifier: string } {
  const primary = env.TWIN_MODEL?.trim() || MODEL_DEFAULTS.model
  const fallbacks = (env.TWIN_MODEL_FALLBACKS?.split(',') ?? [...MODEL_DEFAULTS.fallbacks]).map((s) => s.trim()).filter(Boolean)
  return {
    primary,
    chain: [...new Set([primary, ...fallbacks])],
    classifier: env.TWIN_CLASSIFIER_MODEL?.trim() || MODEL_DEFAULTS.classifier,
  }
}

// The provider reads OPENROUTER_API_KEY at request time, so constructing it at build time is safe.
const openrouter = createOpenRouter({ headers: { 'X-OpenRouter-Title': 'Portfolio Twin' } })

/**
 * The twin's chat model. OpenRouter's documented `models` routing is the fallback: it fails over
 * on provider errors, rate limits and downtime, which eve does not do on its own.
 */
export function twinModel() {
  const { primary, chain } = modelIds(process.env)
  return openrouter.chat(primary, { models: chain, provider: { data_collection: 'deny' }, usage: { include: true } })
}

/** The cheap classifier used for intent and abuse; no fallback chain, since callers time out. */
export function classifierModel() {
  return openrouter.chat(modelIds(process.env).classifier, { provider: { data_collection: 'deny' } })
}
