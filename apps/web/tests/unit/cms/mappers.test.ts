import { describe, expect, it } from 'vitest'
import type { Discipline as CmsDiscipline, Experience, Project } from '@repo/cms-types'
import { filterByDiscipline, toDiscipline, toExperienceEntry, toProjectEntry } from '@/lib/cms/mappers'

const discipline = { id: 1, slug: 'se', title: 'Software engineer', order: 1, level: 'LV 9', figureCaption: 'Fig. 1', bio: { root: { children: [] } }, curiousNotes: [{ id: 'n', side: 'left', text: 'x', formula: null }], updatedAt: '', createdAt: '' } as unknown as CmsDiscipline

describe('mappers', () => {
  it('maps a discipline and drops null formulas', () => {
    expect(toDiscipline(discipline)).toEqual({ slug: 'se', title: 'Software engineer', level: 'LV 9', caption: 'Fig. 1', bio: [], notes: [{ side: 'left', text: 'x' }] })
  })
  it('maps an experience with a period and populated disciplines', () => {
    const e = { id: 7, company: 'Autodoc', chip: 'A', url: null, title: 'Senior SE', startYear: 2023, endYear: null, disciplines: [discipline], order: 1 } as unknown as Experience
    expect(toExperienceEntry(e)).toEqual({ id: '7', chip: 'A', label: 'Autodoc', href: undefined, meta: 'Senior SE', aside: '2023–', disciplines: ['se'] })
  })
  it('maps a project', () => {
    const p = { id: 3, name: 'Sonda', chip: 'S', url: 'https://x.dev', summary: 'Sampler', disciplines: [], order: 1 } as unknown as Project
    expect(toProjectEntry(p)).toEqual({ id: '3', chip: 'S', label: 'Sonda', href: 'https://x.dev', meta: 'Sampler', disciplines: [] })
  })
  it('filters entries: empty disciplines means everywhere', () => {
    const rows = [
      { id: '1', chip: 'A', label: 'a', meta: '', disciplines: ['se'] },
      { id: '2', chip: 'B', label: 'b', meta: '', disciplines: [] },
      { id: '3', chip: 'C', label: 'c', meta: '', disciplines: ['ai'] },
    ]
    expect(filterByDiscipline(rows, 'se').map((r) => r.id)).toEqual(['1', '2'])
  })
})
