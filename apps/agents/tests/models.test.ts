import { describe, expect, it } from 'vitest'
import { modelIds } from '../agent/lib/models'

describe('modelIds', () => {
  it('uses the documented defaults when env is absent (build time)', () => {
    expect(modelIds({})).toEqual({ primary: 'anthropic/claude-sonnet-5.5', chain: ['anthropic/claude-sonnet-5.5', 'deepseek/deepseek-v4.1-flash'], classifier: 'deepseek/deepseek-v4.1-flash' })
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
