// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OsAppProps } from '@/features/os/apps'
import type { Line } from '@/features/os/apps/messenger/parts'
import type { MessengerLabels } from '@/lib/cms/types'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const twin = vi.hoisted(() => ({
  state: { lines: [] as Line[], typing: false, refusal: null as string | null },
  send: undefined as unknown as ReturnType<typeof vi.fn>,
  reset: undefined as unknown as ReturnType<typeof vi.fn>,
}))

vi.mock('@/features/os/apps/messenger/use-twin', () => ({
  useTwin: () => ({ ...twin.state, send: twin.send, reset: twin.reset }),
}))

const { Conversation } = await import('@/features/os/apps/messenger/Conversation')

const labels: MessengerLabels = {
  search: 's',
  favorites: 'f',
  friends: 'fr',
  whatsNew: 'w',
  typing: '{name} is typing',
  conversation: '{name} - Conversation',
  send: 'Send',
  listeningTo: 'l',
  throttled: 'Slow down',
  tooLong: 'Too long',
  ended: 'That is all for today',
  offline: 'Vinicius is offline',
  privacy: 'Chats are stored for 30 days',
  deleteData: 'Delete my data',
  bookingTitle: 'Book a call',
  yourTime: 'Your time',
  myTime: 'My time',
  bookingNotice: 'Call booked for {time}',
  menu: [],
}

const data = {
  messenger: {
    viewer: { name: 'Ana', status: 'available' },
    contact: { name: 'Vinicius', status: 'available' },
    labels,
  },
} as unknown as OsAppProps['data']

let host: HTMLElement
let root: Root

const render = () => act(() => root.render(createElement(Conversation, { data, open: () => {}, programs: [] } as unknown as OsAppProps)))
const deleteButton = () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Delete my data')
const status = () => host.querySelector('[role="status"]')?.textContent

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  twin.state = { lines: [], typing: false, refusal: null }
  twin.send = vi.fn(async () => {})
  twin.reset = vi.fn()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('Conversation', () => {
  it('explains a refusal with its CMS label', () => {
    twin.state.refusal = 'too_long'
    render()
    expect(status()).toBe('Too long')
  })

  it('writes a booking notice as a system line and leaves a cancellation out', () => {
    twin.state.lines = [
      { kind: 'notice', id: 'n1', notice: { twinNotice: 1, kind: 'booking.confirmed' } },
      { kind: 'notice', id: 'n2', notice: { twinNotice: 1, kind: 'booking.cancelled' } },
    ]
    render()
    expect(host.querySelector('[role="log"]')?.textContent).toBe('Call booked for ')
  })

  it('erases the visitor data, then starts a fresh session', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    render()
    await act(async () => deleteButton()?.click())
    expect(fetch).toHaveBeenCalledWith('/api/twin/me', { method: 'DELETE' })
    expect(twin.reset).toHaveBeenCalledTimes(1)
    expect(status()).toBeUndefined()
  })

  it('keeps the session and says offline when the erase fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
    render()
    await act(async () => deleteButton()?.click())
    expect(twin.reset).not.toHaveBeenCalled()
    expect(status()).toBe('Vinicius is offline')

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await act(async () => deleteButton()?.click())
    expect(twin.reset).not.toHaveBeenCalled()
    expect(status()).toBe('Vinicius is offline')
  })
})
