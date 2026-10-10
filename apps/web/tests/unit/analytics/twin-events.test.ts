import { describe, expect, it } from 'vitest'
import { messageSentProps } from '@/features/os/apps/messenger/twin-analytics'

describe('messageSentProps', () => {
  it('counts characters and the visitor turn, never the text', () => {
    const props = messageSentProps('  hello there  ', 2)
    expect(props).toEqual({ chars: 11, turn: 3 })
    expect(JSON.stringify(props)).not.toContain('hello')
  })
})
