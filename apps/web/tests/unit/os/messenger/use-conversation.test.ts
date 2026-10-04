// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scriptedResponder, typingDelay } from '@/features/os/apps/messenger/responder'
import { useConversation } from '@/features/os/apps/messenger/use-conversation'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const respond = scriptedResponder(['one', 'two'])
let api: ReturnType<typeof useConversation>

function Harness() {
  api = useConversation(respond)
  return null
}

let host: HTMLElement
let root: Root
let mounted: boolean

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(createElement(Harness)))
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

  it('keeps typing until every pending reply has arrived', async () => {
    await act(async () => {
      void api.send('a')
      void api.send('b')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(typingDelay('one'))
    })
    expect(api.typing).toBe(false)
    expect(lines()).toEqual([['viewer', 'a'], ['viewer', 'b'], ['contact', 'one'], ['contact', 'two']])
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
    await vi.advanceTimersByTimeAsync(typingDelay('one'))
    expect(lines()).toEqual([['viewer', 'hi']])
  })
})
