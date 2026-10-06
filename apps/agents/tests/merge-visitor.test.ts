import { describe, expect, it } from 'vitest'
import { mergeVisitor } from '../agent/lib/merge-visitor'

describe('mergeVisitor', () => {
  it('adds new fields and overwrites changed ones', () => {
    expect(mergeVisitor({ name: 'Ana', company: 'Acme' }, { company: 'Globex', role: 'CTO' })).toEqual({
      name: 'Ana',
      company: 'Globex',
      role: 'CTO',
    })
  })

  it('never erases a stored value with input that sanitises to nothing', () => {
    expect(mergeVisitor({ name: 'Ana', role: 'CTO' }, { name: '<>', role: '  `` ' })).toEqual({ name: 'Ana', role: 'CTO' })
  })

  it('sanitises with the contract rules before merging', () => {
    expect(mergeVisitor({}, { name: '  <b>Ana</b>\n  Lima ' })).toEqual({ name: 'bAna/b Lima' })
  })

  it('truncates long input instead of rejecting it', () => {
    const merged = mergeVisitor({}, { name: 'a'.repeat(200), company: 'c'.repeat(500) })
    expect(merged.name).toHaveLength(80)
    expect(merged.company).toHaveLength(120)
  })

  it('keeps stored fields the patch leaves out, including booleans and kinds', () => {
    expect(mergeVisitor({ kind: 'recruiter', technical: true }, { technical: false })).toEqual({
      kind: 'recruiter',
      technical: false,
    })
  })

  it('does not write undefined keys into the stored record', () => {
    const merged = mergeVisitor({ name: 'Ana' }, { name: undefined, company: '<>' })
    expect(Object.keys(merged)).toEqual(['name'])
  })
})
