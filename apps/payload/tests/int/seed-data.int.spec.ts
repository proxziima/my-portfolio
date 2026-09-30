import { describe, expect, it } from 'vitest'
import { contactLinks, defaultDisciplineSlug, disciplines, experiences, projects } from '@/seed/data'

const slugs = new Set(disciplines.map((d) => d.slug))

describe('seed data', () => {
  it('has unique discipline slugs', () => {
    expect(slugs.size).toBe(disciplines.length)
  })
  it('keeps bios parallel: same paragraph count everywhere', () => {
    const counts = new Set(disciplines.map((d) => d.bio.root.children.length))
    expect(counts.size).toBe(1)
  })
  it('only references existing disciplines', () => {
    for (const row of [...experiences, ...projects]) {
      for (const slug of row.disciplines) expect(slugs.has(slug)).toBe(true)
    }
    expect(slugs.has(defaultDisciplineSlug)).toBe(true)
  })
  it('has one curious toggle per bio', () => {
    for (const d of disciplines) {
      const toggles = JSON.stringify(d.bio).match(/"curiousToggle"/g) ?? []
      expect(toggles).toHaveLength(1)
    }
  })
  it('uses safe contact urls', () => {
    for (const link of contactLinks) expect(link.url).toMatch(/^(https?:\/\/|mailto:)/)
  })
})
