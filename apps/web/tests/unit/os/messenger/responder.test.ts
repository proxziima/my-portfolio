import { describe, expect, it } from 'vitest'
import { scriptedResponder, typingDelay, type Message } from '@/features/os/apps/messenger/responder'

const history = (...from: Message['from'][]): Message[] => from.map((f, id) => ({ id, from: f, text: `m${id}` }))

describe('scriptedResponder', () => {
  it('gives the next reply each turn, then repeats the last', async () => {
    const respond = scriptedResponder(['a', 'b'])
    expect(await respond(history('viewer'))).toBe('a')
    expect(await respond(history('viewer', 'contact', 'viewer'))).toBe('b')
    expect(await respond(history('viewer', 'contact', 'viewer', 'contact', 'viewer'))).toBe('b')
  })
  it("counts the contact's replies, not the visitor's messages", async () => {
    expect(await scriptedResponder(['a', 'b', 'c'])(history('viewer', 'contact', 'viewer', 'viewer'))).toBe('b')
  })
  it('stays silent without replies', async () => {
    expect(await scriptedResponder([])(history('viewer'))).toBe('')
  })
})

describe('typingDelay', () => {
  it('grows with the reply, clamped between 0.8 s and 2.5 s', () => {
    expect(typingDelay('')).toBe(800)
    expect(typingDelay('x'.repeat(30))).toBe(1200)
    expect(typingDelay('x'.repeat(500))).toBe(2500)
  })
})
