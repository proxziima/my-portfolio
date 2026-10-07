import { describe, expect, it } from 'vitest'
import { redactTermsResponse } from '@/endpoints/redact-terms'
import { richText, chip, curious, b } from '@/seed/lexical'
import { lexicalText, rankCorpus, searchTerms, type CorpusEntry } from '@/mcp/twin-corpus'

const entry = (sourceId: string, title: string, text: string, disclosure: CorpusEntry['disclosure'] = 'public', category: CorpusEntry['category'] = null): CorpusEntry => ({
  item: { sourceId, kind: 'project', title, text },
  disclosure,
  category,
})

const corpus = [
  entry('projects:1', 'Atlas design system', 'React component library used across products'),
  entry('projects:2', 'Ledger', 'Go service for payments'),
  entry('knowledge:5', 'Notice period', 'Thirty days', 'restricted', 'availability'),
  entry('knowledge:6', 'Salary', 'secret', 'never', 'compensation'),
]

describe('twin corpus', () => {
  it('drops stopwords and plural endings from queries', () => {
    expect(searchTerms('What projects have you built with React?')).toEqual(['project', 'built', 'react'])
  })

  it('ranks title matches above body matches and returns public items in full', () => {
    const r = rankCorpus(corpus, 'react projects', 5)
    expect(r.items[0]?.sourceId).toBe('projects:1')
    expect(r.restricted).toEqual([])
  })

  it('returns restricted entries as stubs and never-tier entries not at all', () => {
    const r = rankCorpus(corpus, 'notice period salary', 5)
    expect(r.restricted).toEqual([{ sourceId: 'knowledge:5', topic: 'Notice period', category: 'availability' }])
    expect(JSON.stringify(r)).not.toContain('secret')
    expect(JSON.stringify(r)).not.toContain('Thirty days')
  })

  it('answers a query nothing matches with the public overview: profile, roles, then experience', () => {
    const c: CorpusEntry[] = [
      ...corpus,
      { item: { sourceId: 'experiences:1', kind: 'experience', title: 'AI Engineer at Autodoc', text: 'AI Engineer at Autodoc, 2024–present' }, disclosure: 'public', category: null },
      { item: { sourceId: 'experiences:2', kind: 'experience', title: 'Hidden role', text: 'x' }, disclosure: 'restricted', category: null },
      { item: { sourceId: 'disciplines:1', kind: 'discipline', title: 'Role: AI Engineer', text: 'Builds agents' }, disclosure: 'public', category: null },
      { item: { sourceId: 'profile:global', kind: 'profile', title: 'Profile: Vinicius', text: 'Vinicius · Brazil' }, disclosure: 'public', category: null },
    ]
    const r = rankCorpus(c, 'me fale sobre seu background técnico', 5)
    expect(r.overview).toBe(true)
    expect(r.items.map((i) => i.sourceId)).toEqual(['profile:global', 'disciplines:1', 'experiences:1'])
    expect(r.restricted).toEqual([])
    expect(rankCorpus(c, 'react', 5).overview).toBeUndefined()
  })

  it('matches whole words, not fragments: "mais" does not hit "mailto"', () => {
    const c: CorpusEntry[] = [{ item: { sourceId: 'contact:global', kind: 'contact', title: 'Contact links', text: 'Send me a message: mailto:me@example.com' }, disclosure: 'public', category: null }]
    expect(rankCorpus(c, 'mais', 5).overview).toBe(true)
    expect(rankCorpus(c, 'message', 5).items.map((i) => i.sourceId)).toEqual(['contact:global'])
  })

  it('never surfaces a never-tier entry through the overview, even when only it matches', () => {
    const r = rankCorpus(corpus, 'secret', 5)
    expect(r.overview).toBe(true)
    expect(r.items.map((i) => i.sourceId)).not.toContain('knowledge:6')
  })

  it('flattens lexical bios', () => {
    const bio = { root: { children: [{ type: 'paragraph', children: [{ text: 'I build ' }, { text: 'tools.' }] }, { type: 'paragraph', children: [{ text: 'Second.' }] }] } }
    expect(lexicalText(bio)).toBe('I build tools.\nSecond.')
  })

  it('names record links through the resolver and drops unresolved ones', () => {
    const bio = { root: { children: [{ type: 'paragraph', children: [
      { type: 'text', text: 'At ' },
      { type: 'inlineBlock', fields: { blockType: 'recordLink', record: { relationTo: 'companies', value: 3 } } },
      { type: 'text', text: ' and ' },
      { type: 'inlineBlock', fields: { blockType: 'recordLink', record: { relationTo: 'projects', value: 9 } } },
    ] }] } }
    const names = (ref: unknown) => {
      const { relationTo, value } = ref as { relationTo: string; value: number }
      return relationTo === 'companies' && value === 3 ? 'Autodoc' : undefined
    }
    expect(lexicalText(bio, names)).toBe('At Autodoc and')
  })

  it('scores restricted entries on their title only, so hidden text cannot be probed', () => {
    const c = [entry('knowledge:7', 'Notice period', 'Thirty days in Berlin', 'restricted', 'availability')]
    expect(rankCorpus(c, 'berlin', 5).restricted).toEqual([])
    expect(rankCorpus(c, 'notice', 5).restricted).toEqual([{ sourceId: 'knowledge:7', topic: 'Notice period', category: 'availability' }])
  })

  it('keeps inline block names (chip labels, curious words) in flattened bios', () => {
    const bio = richText([['Worked at ', chip('Autodoc', 'co'), ' and ', b('Acme'), ' being ', curious('curious'), '.']])
    const text = lexicalText(bio)
    expect(text).toContain('Autodoc')
    expect(text).toContain('Acme')
    expect(text).toContain('curious')
  })

  it('collects never-tier terms and allow-lists public contact values', () => {
    const r = redactTermsResponse(
      [{ redactTerms: [{ term: 'Acme Secret' }, { term: ' ' }] }, { redactTerms: null }],
      { email: 'me@site.dev' },
      [{ url: 'mailto:hello@site.dev' }, { url: 'https://github.com/x' }],
    )
    expect(r).toEqual({ terms: ['Acme Secret'], allow: ['me@site.dev', 'hello@site.dev'] })
  })
})
