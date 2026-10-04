import { describe, expect, it } from 'vitest'
import { groupBySender } from '@/features/os/apps/messenger/History'
import type { Message } from '@/features/os/apps/messenger/responder'

const m = (id: number, from: Message['from']): Message => ({ id, from, text: `t${id}` })

describe('groupBySender', () => {
  it('runs consecutive messages from one sender under one name', () => {
    const groups = groupBySender([m(0, 'viewer'), m(1, 'viewer'), m(2, 'contact'), m(3, 'viewer')])
    expect(groups.map((g) => [g.from, g.messages.map((x) => x.id)])).toEqual([
      ['viewer', [0, 1]],
      ['contact', [2]],
      ['viewer', [3]],
    ])
  })
  it('has no groups without messages', () => {
    expect(groupBySender([])).toEqual([])
  })
})
