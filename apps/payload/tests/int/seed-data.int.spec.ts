import { describe, expect, it } from 'vitest'
import { companies, contactLinks, defaultDisciplineSlug, disciplines, experiences, projects } from '@/seed/data'
import { company, project, richText } from '@/seed/lexical'

const slugs = new Set(disciplines.map((d) => d.slug))

describe('seed data', () => {
  it('has unique discipline slugs', () => {
    expect(slugs.size).toBe(disciplines.length)
  })
  it('keeps bios parallel: same paragraph count everywhere', () => {
    const counts = new Set(disciplines.map((d) => d.bio.length))
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
      const toggles = JSON.stringify(richText(d.bio)).match(/"curiousToggle"/g) ?? []
      expect(toggles).toHaveLength(1)
    }
  })
  it('uses safe contact urls', () => {
    for (const link of contactLinks) expect(link.url).toMatch(/^(https?:\/\/|mailto:)/)
  })
  it('references only seeded companies and projects', () => {
    const companyNames = new Set(companies.map((c) => c.name))
    const projectNames = new Set(projects.map((p) => p.name))
    expect(companyNames.size).toBe(companies.length)
    for (const e of experiences) expect(companyNames.has(e.company)).toBe(true)
    for (const p of projects) if (p.company) expect(companyNames.has(p.company)).toBe(true)
    for (const d of disciplines) {
      for (const segment of d.bio.flat()) {
        if (typeof segment === 'object' && 'record' in segment) {
          expect((segment.record === 'companies' ? companyNames : projectNames).has(segment.name)).toBe(true)
        }
      }
    }
  })
  it('turns record links into recordLink blocks when resolved and plain text otherwise', () => {
    const json = JSON.stringify(richText([[company('Autodoc'), ' / ', project('Nowhere')]], (to, name) => (to === 'companies' && name === 'Autodoc' ? 4 : undefined)))
    expect(json).toContain('"blockType":"recordLink","record":{"relationTo":"companies","value":4}')
    expect(json).toContain('"text":"Nowhere"')
  })
})
