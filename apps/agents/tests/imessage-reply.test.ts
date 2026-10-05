import { describe, expect, it } from 'vitest'
import { confirmationText, helpText, lateReplyText, parseOwnerReply, requestText, unknownCodeText } from '../agent/lib/imessage-reply'
import { toE164 } from '../agent/lib/phone'

describe('toE164', () => {
  it('normalises handles to E.164 and rejects Apple IDs and junk', () => {
    expect(toE164('+55 (11) 99999-8888')).toBe('+5511999998888')
    expect(toE164('15550000001')).toBe('+15550000001')
    expect(toE164('owner@icloud.com')).toBeNull()
    expect(toE164('+0123')).toBeNull()
  })

  it('rejects phone-number-like strings with non-allowed characters', () => {
    expect(toE164('+1 555 000 0001 #5')).toBeNull()
    expect(toE164('tel:+15550000001')).toBeNull()
    expect(toE164('0015550000001')).toBeNull()
  })
})

describe('parseOwnerReply', () => {
  it.each([
    ['YES K7Q2', 'approved', 'K7Q2'],
    ['yes k7q2', 'approved', 'K7Q2'],
    ['  Approve  K7Q2. ', 'approved', 'K7Q2'],
    ['ok k7q2!', 'approved', 'K7Q2'],
    ['y K7Q2', 'approved', 'K7Q2'],
    ['NO K7Q2', 'denied', 'K7Q2'],
    ['deny k7q2', 'denied', 'K7Q2'],
    ['n K7Q2', 'denied', 'K7Q2'],
    ['yes', 'approved', null],
    ['No.', 'denied', null],
  ])('%s', (text, status, code) => {
    expect(parseOwnerReply(text)).toEqual({ kind: 'decision', status, code })
  })

  it.each(['', 'maybe', 'yes K7Q', 'yes K7Q2 please', 'K7Q2', 'yes yes', '👍', 'YES, K7Q2', 'yes ABCDE'])('rejects %j', (text) => {
    expect(parseOwnerReply(text)).toEqual({ kind: 'unrecognised' })
  })

  it.each([
    ['YES K7Q2?!', 'approved', 'K7Q2'],
    ['yes\tk7q2', 'approved', 'K7Q2'],
  ])('accepts punctuation and tabs: %s', (text, status, code) => {
    expect(parseOwnerReply(text)).toEqual({ kind: 'decision', status, code })
  })
})

describe('owner texts', () => {
  it('builds the request from the row only, with the code and the deadline', () => {
    expect(requestText({ topic: 'Notice period', sourceId: 'knowledge:5', replyCode: 'K7Q2' }, '15m')).toBe(
      'Twin approval request\nTopic: Notice period\nItem: knowledge:5\nReply YES K7Q2 to share or NO K7Q2 to decline. Auto-denies after 15m.',
    )
  })

  it('confirms decisions and explains late or unknown replies', () => {
    expect(confirmationText('approved', 'K7Q2', 'Notice period')).toBe('Approved K7Q2: Notice period.')
    expect(confirmationText('denied', 'K7Q2', 'Notice period')).toBe('Denied K7Q2: Notice period. Nothing was shared.')
    expect(lateReplyText('expired', 'K7Q2')).toBe('K7Q2 already expired; nothing was shared.')
    expect(lateReplyText('approved', 'K7Q2')).toBe('K7Q2 was already approved.')
    expect(unknownCodeText('ZZZZ')).toBe('No approval ZZZZ is waiting.')
  })

  it('lists pending codes in the help text, at most three', () => {
    expect(helpText([])).toBe('Nothing is waiting for approval.')
    const four = ['A', 'B', 'C', 'D'].map((c) => ({ replyCode: `${c}${c}${c}${c}`, topic: `T${c}` }))
    expect(helpText(four)).toBe('Reply YES <code> or NO <code>. Waiting: AAAA (TA), BBBB (TB), CCCC (TC), and 1 more.')
  })
})
