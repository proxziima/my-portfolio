import { describe, expect, it } from 'vitest'
import { formatPeriod } from '@/lib/format/period'

describe('formatPeriod', () => {
  it('open-ended', () => expect(formatPeriod(2023)).toBe('2023–'))
  it('same century shortens the end year', () => expect(formatPeriod(2021, 2023)).toBe('2021–23'))
  it('same year collapses', () => expect(formatPeriod(2020, 2020)).toBe('2020'))
  it('different century keeps both in full', () => expect(formatPeriod(1998, 2003)).toBe('1998–2003'))
})
