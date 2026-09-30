import { describe, expect, it } from 'vitest'
import { resolveInitialSlug } from '@/features/role/initial-slug'

const slugs = ['se', 'ai', 'civil']

describe('resolveInitialSlug', () => {
  it('prefers a valid hash over the stored value', () => {
    expect(resolveInitialSlug('#civil', 'ai', slugs)).toBe('civil')
  })
  it('accepts the hash with or without the leading #', () => {
    expect(resolveInitialSlug('ai', null, slugs)).toBe('ai')
  })
  it('falls back to a valid stored value when the hash is empty or unknown', () => {
    expect(resolveInitialSlug('', 'ai', slugs)).toBe('ai')
    expect(resolveInitialSlug('#work', 'ai', slugs)).toBe('ai')
  })
  it('returns null when neither is a known slug', () => {
    expect(resolveInitialSlug('#work', 'retired', slugs)).toBeNull()
    expect(resolveInitialSlug('', null, slugs)).toBeNull()
    expect(resolveInitialSlug('#', '', slugs)).toBeNull()
  })
})
