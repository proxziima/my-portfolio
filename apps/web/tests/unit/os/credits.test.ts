import { describe, expect, it } from 'vitest'
import { CREDITS, nextSection } from '@/features/os/apps/credits-data'

describe('CREDITS', () => {
  it('opens with the owner, who did it all', () => {
    expect(CREDITS('Vinicius')[0]).toEqual({ title: 'Engineering & Design', rows: [['Vinicius', 'All']] })
  })
  it('has at least one row in every section', () => {
    for (const section of CREDITS('Vinicius')) expect(section.rows.length).toBeGreaterThan(0)
  })
})

describe('nextSection', () => {
  it('steps forward', () => {
    expect(nextSection(0, 5)).toBe(1)
  })
  it('wraps from the last section to the first', () => {
    expect(nextSection(4, 5)).toBe(0)
  })
  it('stays at 0 when there are no sections', () => {
    expect(nextSection(0, 0)).toBe(0)
  })
})
