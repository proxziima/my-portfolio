import { describe, expect, it } from 'vitest'
import { scriptedResponder, typingDelay, type Message } from '@/features/os/apps/messenger/responder'

const fromViewer = (n: number): Message[] => Array.from({ length: n }, (_, i) => ({ id: i, from: 'viewer', text: `m${i}` }))

describe('scriptedResponder', () => {
  it("answers the visitor's Nth message with the Nth reply, then repeats the last", async () => {
    const respond = scriptedResponder(['a', 'b'])
    expect(await respond(fromViewer(1))).toBe('a')
    expect(await respond(fromViewer(2))).toBe('b')
    expect(await respond(fromViewer(3))).toBe('b')
  })
  it("counts only the visitor's messages", async () => {
    const history: Message[] = [
      { id: 0, from: 'viewer', text: 'hi' },
      { id: 1, from: 'contact', text: 'a' },
      { id: 2, from: 'viewer', text: 'again' },
    ]
    expect(await scriptedResponder(['a', 'b', 'c'])(history)).toBe('b')
  })
  it('stays silent without replies', async () => {
    expect(await scriptedResponder([])(fromViewer(1))).toBe('')
  })
})

describe('typingDelay', () => {
  it('grows with the reply, clamped between 0.8 s and 2.5 s', () => {
    expect(typingDelay('')).toBe(800)
    expect(typingDelay('x'.repeat(30))).toBe(1200)
    expect(typingDelay('x'.repeat(500))).toBe(2500)
  })
})
