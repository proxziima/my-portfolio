import { describe, expect, it } from 'vitest'
import { splitName } from '@/features/os/apps/showcase/Sidebar'

describe('splitName', () => {
  it('puts the first and last name on their own lines', () => {
    expect(splitName('Vinicius Queiroz')).toEqual(['Vinicius', 'Queiroz'])
  })
  it('keeps a single word on the first line', () => {
    expect(splitName('Vinicius')).toEqual(['Vinicius', ''])
  })
  it('splits on the last space: the given names stay together', () => {
    expect(splitName('Vinicius de Queiroz')).toEqual(['Vinicius de', 'Queiroz'])
  })
})
