import { describe, expect, it } from 'vitest'
import { intentClassifierModel, modelIds, tierModel, twinModel } from '../agent/lib/models'

describe('modelIds', () => {
  it('uses the documented defaults when env is absent (build time)', () => {
    const { tiers, ...rest } = modelIds({})
    expect(rest).toEqual({
      primary: 'deepseek/deepseek-v4.1-flash',
      chain: ['deepseek/deepseek-v4.1-flash', 'anthropic/claude-haiku-4.5'],
      classifier: 'google/gemini-2.5-flash-lite',
      intent: 'mistralai/ministral-14b-2512',
      contextTokens: 1_000_000,
    })
    expect(tiers.standard).toMatchObject({ id: rest.primary, chain: rest.chain, contextTokens: rest.contextTokens })
  })

  // docker-compose renders `${VAR:-}` as '', which must behave like an unset variable (as parseEnv does).
  it.each(['', '   '])('treats %j model vars as absent, so the defaults and the fallback chain hold', (blank) => {
    const env = {
      TWIN_MODEL: blank,
      TWIN_MODEL_FALLBACKS: blank,
      TWIN_CLASSIFIER_MODEL: blank,
      TWIN_INTENT_MODEL: blank,
      TWIN_MODEL_CONTEXT_TOKENS: blank,
      TWIN_MODEL_LIGHT: blank,
      TWIN_MODEL_LIGHT_CONTEXT_TOKENS: blank,
      TWIN_MODEL_DEEP: blank,
      TWIN_MODEL_DEEP_CONTEXT_TOKENS: blank,
    }
    expect(modelIds(env)).toEqual(modelIds({}))
  })

  it('reads the context window override', () => {
    expect(modelIds({ TWIN_MODEL_CONTEXT_TOKENS: ' 200000 ' }).contextTokens).toBe(200_000)
  })

  it('reads overrides and never duplicates the primary in the fallback chain', () => {
    const ids = modelIds({ TWIN_MODEL: 'a/b', TWIN_MODEL_FALLBACKS: 'c/d, a/b', TWIN_CLASSIFIER_MODEL: 'e/f' })
    expect(ids.chain).toEqual(['a/b', 'c/d'])
    expect(ids.classifier).toBe('e/f')
  })

  it('reads the intent model on its own, independent of the gate classifier', () => {
    expect(modelIds({ TWIN_CLASSIFIER_MODEL: 'e/f' }).intent).toBe('mistralai/ministral-14b-2512')
    expect(modelIds({ TWIN_INTENT_MODEL: ' g/h ' }).intent).toBe('g/h')
  })

  it('dedupes repeated fallbacks', () => {
    expect(modelIds({ TWIN_MODEL: 'a/b', TWIN_MODEL_FALLBACKS: 'c/d, c/d,a/b, e/f' }).chain).toEqual(['a/b', 'c/d', 'e/f'])
  })
})

describe('modelIds tiers', () => {
  it('resolves each tier to its default model, window and reasoning', () => {
    const { tiers } = modelIds({})
    expect(tiers.light).toEqual({ id: 'deepseek/deepseek-v4.1-flash', chain: ['deepseek/deepseek-v4.1-flash', 'anthropic/claude-haiku-4.5'], contextTokens: 1_000_000, reasoning: 'low' })
    expect(tiers.standard).toEqual({ id: 'deepseek/deepseek-v4.1-flash', chain: ['deepseek/deepseek-v4.1-flash', 'anthropic/claude-haiku-4.5'], contextTokens: 1_000_000, reasoning: 'low' })
    expect(tiers.deep).toEqual({ id: 'anthropic/claude-opus-5.5', chain: ['anthropic/claude-opus-5.5', 'deepseek/deepseek-v4.1-flash', 'anthropic/claude-haiku-4.5'], contextTokens: 1_000_000, reasoning: 'medium' })
  })

  it('makes deep fall back through standard, and light only through the shared tail', () => {
    const { tiers } = modelIds({ TWIN_MODEL: 'a/std', TWIN_MODEL_LIGHT: 'a/light', TWIN_MODEL_DEEP: 'a/deep', TWIN_MODEL_FALLBACKS: 'z/one,z/two' })
    expect(tiers.deep.chain).toEqual(['a/deep', 'a/std', 'z/one', 'z/two'])
    expect(tiers.standard.chain).toEqual(['a/std', 'z/one', 'z/two'])
    expect(tiers.light.chain).toEqual(['a/light', 'z/one', 'z/two'])
  })

  it('dedupes every chain, including a tier that shares its model with another', () => {
    const { tiers } = modelIds({ TWIN_MODEL: 'a/std', TWIN_MODEL_DEEP: 'a/std', TWIN_MODEL_LIGHT: 'z/one', TWIN_MODEL_FALLBACKS: 'z/one, a/std' })
    expect(tiers.deep.chain).toEqual(['a/std', 'z/one'])
    expect(tiers.standard.chain).toEqual(['a/std', 'z/one'])
    expect(tiers.light.chain).toEqual(['z/one', 'a/std'])
  })

  it('honours context window overrides per tier, trimming whitespace', () => {
    const { tiers } = modelIds({ TWIN_MODEL_LIGHT_CONTEXT_TOKENS: ' 64000 ', TWIN_MODEL_CONTEXT_TOKENS: '300000', TWIN_MODEL_DEEP_CONTEXT_TOKENS: '500000' })
    expect([tiers.light.contextTokens, tiers.standard.contextTokens, tiers.deep.contextTokens]).toEqual([64_000, 300_000, 500_000])
  })

  it('reads the tier ids from env', () => {
    const { tiers } = modelIds({ TWIN_MODEL_LIGHT: ' a/light ', TWIN_MODEL_DEEP: 'a/deep' })
    expect([tiers.light.id, tiers.deep.id]).toEqual(['a/light', 'a/deep'])
  })
})

describe('tier models', () => {
  it('builds an OpenRouter model for every tier, and twinModel is the standard one', () => {
    for (const tier of ['light', 'standard', 'deep'] as const) expect(tierModel(tier)).toBeDefined()
    expect(twinModel().modelId).toBe(tierModel('standard').modelId)
    expect(tierModel('light').modelId).toBe(modelIds(process.env).tiers.light.id)
    expect(tierModel('deep').modelId).toBe(modelIds(process.env).tiers.deep.id)
  })
})

describe('intent classifier model', () => {
  it('runs on the intent model, failing over to another provider', () => {
    const model = intentClassifierModel()
    expect(model.modelId).toBe(modelIds(process.env).intent)
    const models = model.settings.models
    expect(models?.[0]).toBe(model.modelId)
    expect(models).toContain('google/gemini-3.1-flash-lite')
    expect(new Set(models).size).toBe(models?.length)
  })
})
