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

  it('flattens lexical bios', () => {
    const bio = { root: { children: [{ type: 'paragraph', children: [{ text: 'I build ' }, { text: 'tools.' }] }, { type: 'paragraph', children: [{ text: 'Second.' }] }] } }
    expect(lexicalText(bio)).toBe('I build tools.\nSecond.')
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
