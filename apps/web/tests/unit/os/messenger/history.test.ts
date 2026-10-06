// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ScheduleCallRendered, TwinNotice } from '@repo/twin/contract'
import { groupBySender, History } from '@/features/os/apps/messenger/History'
import type { Line, TextLine } from '@/features/os/apps/messenger/parts'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const m = (id: number, from: TextLine['from'], text = `t${id}`): Line => ({ kind: 'text', id: String(id), from, text })

const booking: ScheduleCallRendered = {
  status: 'rendered',
  calOrigin: 'https://cal.example',
  embedScriptUrl: 'https://cal.example/embed/embed.js',
  calLink: 'owner/intro',
  bookingRef: 'r.s',
  ownerTimeZone: 'America/Sao_Paulo',
  visitorTimeZone: 'Europe/Lisbon',
}
const b = (id: number): Line => ({ kind: 'booking', id: String(id), booking })
const n = (id: number, kind: TwinNotice['kind'] = 'booking.confirmed'): Line => ({
  kind: 'notice',
  id: String(id),
  notice: { twinNotice: 1, kind, startTime: '2026-10-08T14:00:00Z' },
})

/** Each group as [sender or 'notice', the ids it holds]. */
const shape = (lines: Line[]) =>
  groupBySender(lines).map((g) => (g.kind === 'notice' ? ['notice', [Number(g.line.id)]] : [g.from, g.lines.map((x) => Number(x.id))]))

describe('groupBySender', () => {
  it('runs consecutive text lines from one sender under one name', () => {
    expect(shape([m(0, 'viewer'), m(1, 'viewer'), m(2, 'contact'), m(3, 'viewer')])).toEqual([
      ['viewer', [0, 1]],
      ['contact', [2]],
      ['viewer', [3]],
    ])
  })
  it('puts a booking in the contact group', () => {
    expect(shape([m(0, 'viewer'), m(1, 'contact'), b(2), m(3, 'contact'), m(4, 'viewer'), b(5)])).toEqual([
      ['viewer', [0]],
      ['contact', [1, 2, 3]],
      ['viewer', [4]],
      ['contact', [5]],
    ])
  })
  it('keeps a notice as its own item between groups', () => {
    expect(shape([m(0, 'contact'), n(1), m(2, 'contact')])).toEqual([
      ['contact', [0]],
      ['notice', [1]],
      ['contact', [2]],
    ])
  })
  it('has no groups without lines', () => {
    expect(groupBySender([])).toEqual([])
  })
})

describe('History', () => {
  let host: HTMLElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const render = (lines: Line[]) =>
    act(() =>
      root.render(
        createElement(History, {
          lines,
          nameOf: (from) => (from === 'viewer' ? 'Ana' : 'Vinicius'),
          renderBooking: (x) => createElement('section', { 'data-booking': x.bookingRef }),
          noticeText: (x) => (x.kind === 'booking.cancelled' ? '' : `booked ${x.kind}`),
        }),
      ),
    )

  it('renders text as text, the booking inside the contact lines and notices as system lines', () => {
    render([m(0, 'viewer', '<b>hi</b>'), m(1, 'contact'), b(2), n(3), n(4, 'booking.cancelled')])
    const groups = host.querySelectorAll('ol > li')
    expect(groups).toHaveLength(3)
    expect(groups[0]?.textContent).toBe('Ana<b>hi</b>')
    expect(host.querySelector('b')).toBeNull()
    expect(groups[1]?.querySelector('ul > li > section[data-booking="r.s"]')).not.toBeNull()
    expect(groups[2]?.textContent).toBe('booked booking.confirmed')
  })

  it('skips an empty notice without splitting the group around it', () => {
    render([m(0, 'contact'), n(1, 'booking.cancelled'), m(2, 'contact')])
    expect(host.querySelectorAll('ol > li')).toHaveLength(1)
    expect(host.querySelectorAll('ul > li')).toHaveLength(2)
  })
})
