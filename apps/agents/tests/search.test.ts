import { describe, expect, it } from 'vitest'
import { searchForModel, stateAfterSearch } from '../agent/lib/search'
import { initialConversationState } from '@repo/twin/contract'

const key = 'k'.repeat(20)
const result = {
  items: [{ sourceId: 'projects:1', kind: 'project' as const, title: 'Project: Atlas', text: 'Design system', url: 'https://atlas.dev' }],
  restricted: [{ sourceId: 'knowledge:5', topic: 'Notice period', category: 'availability' as const }],
}

describe('search_portfolio helpers', () => {
  it('renders results as untrusted data with restricted stubs and the disclosure rule', () => {
    const out = searchForModel(result, key)
    expect(out).toMatch(/<untrusted source="portfolio"/)
    expect(out).toContain('[projects:1] Project: Atlas')
    expect(out).toContain('[knowledge:5] Notice period (availability)')
    expect(out).toMatch(/request_disclosure/)
  })

  it('tells the model to admit a gap when nothing matched', () => {
    expect(searchForModel({ items: [], restricted: [] }, key)).toMatch(/don't have that detail to hand/)
    expect(searchForModel({ items: [], restricted: [], overview: true }, key)).toMatch(/^No results/)
  })

  it('records cited sources and kinds without duplicates', () => {
    const s = stateAfterSearch(stateAfterSearch(initialConversationState(), result), result)
    expect(s.citedSources).toEqual(['projects:1'])
    expect(s.topicsCited).toEqual(['project'])
    expect(s.toolsUsed).toEqual(['search_portfolio'])
  })

  it('labels an overview as one, so the model answers only what it covers', () => {
    const out = searchForModel({ items: result.items, restricted: [], overview: true }, key)
    expect(out).toContain('[projects:1] Project: Atlas: Design system')
    expect(out).toMatch(/Nothing matched the query directly; this is a general overview of me/)
    expect(out).not.toMatch(/request_disclosure/)
  })
})
