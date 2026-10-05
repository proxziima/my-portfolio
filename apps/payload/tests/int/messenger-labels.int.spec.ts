import { describe, expect, it } from 'vitest'
import { Messenger } from '@/globals/Messenger'

type Named = { name?: string; fields?: Named[] }
const group = (name: string) => (Messenger.fields as Named[]).find((f) => f.name === name)

describe('messenger global for the twin', () => {
  it('no longer carries scripted replies', () => {
    expect(group('contact')?.fields?.some((f) => f.name === 'replies')).toBe(false)
  })

  it('has the labels the twin conversation needs', () => {
    const names = group('labels')?.fields?.map((f) => f.name)
    for (const n of ['throttled', 'tooLong', 'ended', 'offline', 'privacy', 'deleteData', 'bookingTitle', 'yourTime', 'myTime', 'bookingNotice']) {
      expect(names).toContain(n)
    }
  })
})
