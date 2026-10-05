import { describe, expect, it } from 'vitest'
import { modelIds } from '../agent/lib/models'

describe('modelIds', () => {
  it('uses the documented defaults when env is absent (build time)', () => {
    expect(modelIds({})).toEqual({ primary: 'anthropic/claude-sonnet-5.5', chain: ['anthropic/claude-sonnet-5.5', 'deepseek/deepseek-v4.1-flash'], classifier: 'deepseek/deepseek-v4.1-flash', contextTokens: 1_000_000 })
  })

  // docker-compose renders `${VAR:-}` as '', which must behave like an unset variable (as parseEnv does).
  it.each(['', '   '])('treats %j model vars as absent, so the defaults and the fallback chain hold', (blank) => {
    const env = { TWIN_MODEL: blank, TWIN_MODEL_FALLBACKS: blank, TWIN_CLASSIFIER_MODEL: blank, TWIN_MODEL_CONTEXT_TOKENS: blank }
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

  it('dedupes repeated fallbacks', () => {
    expect(modelIds({ TWIN_MODEL: 'a/b', TWIN_MODEL_FALLBACKS: 'c/d, c/d,a/b, e/f' }).chain).toEqual(['a/b', 'c/d', 'e/f'])
  })
})
