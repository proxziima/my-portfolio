import { describe, expect, it } from 'vitest'
import { filterByDiscipline } from '@/lib/cms/filter'

describe('filterByDiscipline', () => {
  it('keeps the role\'s entries and the ones with no disciplines', () => {
    const rows = [
      { id: '1', chip: 'A', label: 'a', meta: '', disciplines: ['se'] },
      { id: '2', chip: 'B', label: 'b', meta: '', disciplines: [] },
      { id: '3', chip: 'C', label: 'c', meta: '', disciplines: ['ai'] },
    ]
    expect(filterByDiscipline(rows, 'se').map((r) => r.id)).toEqual(['1', '2'])
  })
})
