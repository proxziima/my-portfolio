import { describe, expect, it } from 'vitest'
import { disclosureRead } from '@/access/disclosure-read'
import { DISCLOSURE_TIERS, disclosureField } from '@/fields/disclosure'

const call = (user: unknown) => disclosureRead({ req: { user } } as Parameters<typeof disclosureRead>[0])

describe('disclosure tiers', () => {
  it('offers exactly public, restricted and never, defaulting to public', () => {
    expect(DISCLOSURE_TIERS).toEqual(['public', 'restricted', 'never'])
    expect(disclosureField().defaultValue).toBe('public')
  })

  it('shows anonymous readers only public documents', () => {
    expect(call(null)).toEqual({ disclosure: { equals: 'public' } })
  })

  it('shows signed-in editors everything', () => {
    expect(call({ id: 1 })).toBe(true)
  })
})
