import { describe, expect, it } from 'vitest'
import { hasNewReply, messageSentProps, replyIds } from '@/features/os/apps/messenger/twin-analytics'

describe('messageSentProps', () => {
  it('counts characters and the visitor turn, never the text', () => {
    const props = messageSentProps('  hello there  ', 2)
    expect(props).toEqual({ chars: 11, turn: 3 })
    expect(JSON.stringify(props)).not.toContain('hello')
  })
})

describe('replyIds and hasNewReply', () => {
  const user = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }
  const old = { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hey!' }] }
  const blank = { id: 'a2', role: 'assistant', parts: [{ type: 'text', text: '  \n\n ' }, { type: 'dynamic-tool' }] }
  const fresh = { id: 'a3', role: 'assistant', parts: [{ type: 'step-start' }, { type: 'text', text: 'Sure.' }] }

  it('collects the twin messages that show text, never the visitor or blank ones', () => {
    expect(replyIds([user, old, blank])).toEqual(new Set(['a1']))
  })

  it('sees a reply only in a twin message with text that was not on screen at the send', () => {
    const before = replyIds([user, old])
    expect(hasNewReply([user, old, user], before)).toBe(false)
    // the previous reply still streaming paragraphs is not this turn's reply
    expect(hasNewReply([user, { ...old, parts: [...old.parts, { type: 'text', text: 'More.' }] }], before)).toBe(false)
    expect(hasNewReply([user, old, blank], before)).toBe(false)
    expect(hasNewReply([user, old, fresh], before)).toBe(true)
    // a renewed session clears the history; its first reply still counts
    expect(hasNewReply([fresh], before)).toBe(true)
  })
})
