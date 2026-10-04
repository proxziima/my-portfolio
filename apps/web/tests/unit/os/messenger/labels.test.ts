import { describe, expect, it } from 'vitest'
import { withName } from '@/features/os/apps/messenger/labels'

describe('withName', () => {
  it("puts the contact's name in place of {name}", () => {
    expect(withName('{name} - Conversation', 'Vinicius')).toBe('Vinicius - Conversation')
  })
  it('replaces every {name}', () => {
    expect(withName('{name}, {name}!', 'Vini')).toBe('Vini, Vini!')
  })
  it('leaves a label without {name} as it is', () => {
    expect(withName('Send', 'Vinicius')).toBe('Send')
  })
})
