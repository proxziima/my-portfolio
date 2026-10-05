import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { ModelTier } from '@repo/twin/contract'
import { blankToUndefined, MODEL_DEFAULTS } from '@repo/twin/env'

/** One routing tier's model: its id, the OpenRouter failover chain, context window and reasoning effort. */
export type TierModel = { id: string; chain: string[]; contextTokens: number; reasoning: 'low' | 'medium' }

/**
 * Model settings resolved from env with the shared defaults; safe at build time (no required vars).
 * A blank variable counts as absent, exactly as in `parseEnv`, so compose's `${VAR:-}` keeps the defaults.
 * `primary`, `chain` and `contextTokens` describe the standard tier; `tiers` has all three.
 */
export function modelIds(env: Record<string, string | undefined>): {
  primary: string
  chain: string[]
  classifier: string
  contextTokens: number
  tiers: Record<ModelTier, TierModel>
} {
  const read = (name: string) => blankToUndefined(env[name])?.trim()
  const tokens = (name: string, fallback: number) => Number(read(name) ?? fallback)
  const primary = read('TWIN_MODEL') ?? MODEL_DEFAULTS.model
  const fallbacks = (read('TWIN_MODEL_FALLBACKS')?.split(',') ?? [...MODEL_DEFAULTS.fallbacks]).map((s) => s.trim()).filter(Boolean)
  const light = read('TWIN_MODEL_LIGHT') ?? MODEL_DEFAULTS.light
  const deep = read('TWIN_MODEL_DEEP') ?? MODEL_DEFAULTS.deep
  const contextTokens = tokens('TWIN_MODEL_CONTEXT_TOKENS', MODEL_DEFAULTS.contextTokens)
  // Each tier fails over through the tiers below it, then the shared tail; a Set keeps every chain unique.
  const chainOf = (...ids: string[]) => [...new Set([...ids, ...fallbacks])]
  return {
    primary,
    chain: chainOf(primary),
    classifier: read('TWIN_CLASSIFIER_MODEL') ?? MODEL_DEFAULTS.classifier,
    contextTokens,
    tiers: {
      light: { id: light, chain: chainOf(light), contextTokens: tokens('TWIN_MODEL_LIGHT_CONTEXT_TOKENS', MODEL_DEFAULTS.lightContextTokens), reasoning: 'low' },
      standard: { id: primary, chain: chainOf(primary), contextTokens, reasoning: 'low' },
      deep: { id: deep, chain: chainOf(deep, primary), contextTokens: tokens('TWIN_MODEL_DEEP_CONTEXT_TOKENS', MODEL_DEFAULTS.deepContextTokens), reasoning: 'medium' },
    },
  }
}

// The provider reads OPENROUTER_API_KEY at request time, so constructing it at build time is safe.
const openrouter = createOpenRouter({ headers: { 'X-OpenRouter-Title': 'Portfolio Twin' } })

/**
 * The chat model for a routing tier. OpenRouter's documented `models` routing is the fallback: it
 * fails over on provider errors, rate limits and downtime, which eve does not do on its own.
 */
export function tierModel(tier: ModelTier) {
  const { id, chain } = modelIds(process.env).tiers[tier]
  return openrouter.chat(id, { models: chain, provider: { data_collection: 'deny' }, usage: { include: true } })
}

/** The twin's default chat model: the standard tier. */
export function twinModel() {
  return tierModel('standard')
}

/** The cheap classifier used for intent and abuse; no fallback chain, since callers time out. */
export function classifierModel() {
  return openrouter.chat(modelIds(process.env).classifier, { provider: { data_collection: 'deny' } })
}
