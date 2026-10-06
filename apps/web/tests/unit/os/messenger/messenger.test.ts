import { describe, expect, it } from 'vitest'
import { matchesQuery } from '@/features/os/apps/messenger/Messenger'

describe('matchesQuery', () => {
  it('matches any part of the name, ignoring case and surrounding spaces', () => {
    expect(matchesQuery('Vinicius Queiroz', '  queir ')).toBe(true)
  })
  it('matches everyone when the search is empty', () => {
    expect(matchesQuery('Vinicius Queiroz', '')).toBe(true)
  })
  it('rejects a name without the text', () => {
    expect(matchesQuery('Vinicius Queiroz', 'zzz')).toBe(false)
  })
})
