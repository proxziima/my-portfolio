import { describe, expect, it } from 'vitest'
import { normalizeQuery } from '../../src/contract/query'

describe('normalizeQuery', () => {
  it('is insensitive to case, spacing, order, duplicates and width', () => {
    expect(normalizeQuery('  React   Native  projects ')).toBe(normalizeQuery('projects react NATIVE react'))
    expect(normalizeQuery('Ｒｅａｃｔ')).toBe('react')
  })

  it('drops punctuation but keeps intra-word symbols used in tech names', () => {
    expect(normalizeQuery('Node.js, C++ & C#?')).toBe('c# c++ node.js')
  })
})
