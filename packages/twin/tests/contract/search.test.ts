import { describe, expect, it } from 'vitest'
import { TwinSearchResult } from '../../src/contract/search'

describe('TwinSearchResult', () => {
  it('accepts public items and restricted stubs, nothing else', () => {
    const ok = TwinSearchResult.parse({
      items: [{ sourceId: 'projects:3', kind: 'project', title: 'Atlas', text: 'A design system', url: 'https://x.dev' }],
      restricted: [{ sourceId: 'knowledge:9', topic: 'Notice period', category: 'availability' }],
    })
    expect(ok.items).toHaveLength(1)
    expect(() => TwinSearchResult.parse({ items: [], restricted: [{ sourceId: 'knowledge:9', topic: 'x', category: 'secret' }] })).toThrow()
  })
})
