import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_CATEGORIES, Knowledge } from '@/collections/Knowledge'

const field = (name: string) => Knowledge.fields.find((f) => 'name' in f && f.name === name)

describe('knowledge collection', () => {
  it('uses the categories the agent scores on', () => {
    expect(KNOWLEDGE_CATEGORIES).toEqual(['availability', 'compensation', 'logistics', 'background', 'voice', 'other'])
  })

  it('has a disclosure tier and redact terms only meaningful for never entries', () => {
    expect(field('disclosure')).toBeDefined()
    const terms = field('redactTerms')
    expect(terms && 'admin' in terms && typeof terms.admin?.condition).toBe('function')
  })
})
