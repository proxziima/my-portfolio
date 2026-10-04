// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scriptedResponder, typingDelay, type Responder } from '@/features/os/apps/messenger/responder'
import { useConversation } from '@/features/os/apps/messenger/use-conversation'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const long = 'x'.repeat(30)
const defaultResponder = scriptedResponder(['one', 'two'])
let respond: Responder
let api: ReturnType<typeof useConversation>

function Harness() {
  api = useConversation(respond)
  return null
}

let host: HTMLElement
let root: Root
let mounted: boolean

const mount = () => act(() => root.render(createElement(Harness)))

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  respond = defaultResponder
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  mount()
  mounted = true
})

afterEach(() => {
  if (mounted) act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const lines = () => api.messages.map((m) => [m.from, m.text])

describe('useConversation', () => {
  it("appends the visitor's message, types, then appends the reply", async () => {
    await act(async () => {
      void api.send('  hi  ')
    })
    expect(lines()).toEqual([['viewer', 'hi']])
    expect(api.typing).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(typingDelay('one'))
    })
    expect(api.typing).toBe(false)
    expect(lines()).toEqual([['viewer', 'hi'], ['contact', 'one']])
  })

  it('delivers replies in the order they were sent, typing until the last arrives', async () => {
    // keyed on the replies already given: by the time a turn runs, both visitor messages are in
    respond = async (history) => [long, 'ok'][history.filter((m) => m.from === 'contact').length] ?? ''
    mount()
    await act(async () => {
      void api.send('a')
      void api.send('b')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(typingDelay(long))
    })
    expect(api.typing).toBe(true)
    expect(lines()).toEqual([['viewer', 'a'], ['viewer', 'b'], ['contact', long]])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(typingDelay('ok'))
    })
    expect(api.typing).toBe(false)
    expect(lines()).toEqual([['viewer', 'a'], ['viewer', 'b'], ['contact', long], ['contact', 'ok']])
  })

  it('does not pause to type when there is no reply', async () => {
    respond = async () => ''
    mount()
    await act(async () => {
      await api.send('hi')
    })
    expect(api.typing).toBe(false)
    expect(lines()).toEqual([['viewer', 'hi']])
  })

  it('ignores blank input', async () => {
    await act(async () => {
      void api.send('   ')
    })
    expect(api.messages).toEqual([])
    expect(api.typing).toBe(false)
  })

  it('drops a reply that arrives after the window closed', async () => {
    await act(async () => {
      void api.send('hi')
    })
    act(() => root.unmount())
    mounted = false
    await act(async () => {
      await vi.advanceTimersByTimeAsync(typingDelay('one'))
    })
    expect(lines()).toEqual([['viewer', 'hi']])
  })
})
