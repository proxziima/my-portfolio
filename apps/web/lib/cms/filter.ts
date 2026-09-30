import type { Entry } from './types'

/** Rows for one role: an entry with no disciplines shows under every role. */
export const filterByDiscipline = (rows: Entry[], slug: string): Entry[] =>
  rows.filter((r) => r.disciplines.length === 0 || r.disciplines.includes(slug))
