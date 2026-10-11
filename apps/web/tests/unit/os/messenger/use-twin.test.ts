// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientError } from 'eve/client'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

interface FakeAgent {
  data: { messages: unknown[] }
  events: { type: string }[]
  status: string
  error: Error | undefined
  send: ReturnType<typeof vi.fn>
  reset: ReturnType<typeof vi.fn>
}

const eve = vi.hoisted(() => ({ options: undefined as Record<string, unknown> | undefined, agent: undefined as unknown }))

vi.mock('eve/react', () => ({
  useEveAgent: (options: Record<string, unknown>) => {
    eve.options = options
    return eve.agent
  },
}))

const track = vi.hoisted(() => vi.fn())
vi.mock('@/lib/analytics/events', () => ({ track }))

const { useTwin } = await import('@/features/os/apps/messenger/use-twin')

const fresh = (): FakeAgent => ({ data: { messages: [] }, events: [], status: 'ready', error: undefined, send: vi.fn(async () => {}), reset: vi.fn() })

let agent: FakeAgent
let api: ReturnType<typeof useTwin>

function Harness() {
  api = useTwin()
  return null
}

let host: HTMLElement
let root: Root

/** Re-renders with a changed agent snapshot, as `useSyncExternalStore` would. */
const update = (change: Partial<FakeAgent>) => {
  agent = { ...agent, ...change }
  eve.agent = agent
  act(() => root.render(createElement(Harness)))
}

const mount = () => {
  root = createRoot(host)
  act(() => root.render(createElement(Harness)))
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  track.mockClear()
  window.localStorage.clear()
  agent = fresh()
  eve.agent = agent
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('useTwin', () => {
  it('talks to the BFF with the visitor time zone and starts fresh without a saved session', async () => {
    mount()
    expect(eve.options).toMatchObject({ host: `${window.location.origin}/api/twin`, initialSession: undefined, resume: false })
    const headers = eve.options?.headers as () => Record<string, string>
    expect(headers()).toEqual({ 'x-twin-tz': Intl.DateTimeFormat().resolvedOptions().timeZone })
  })

  it('resumes the saved session and keeps the stored cursor in step', () => {
    window.localStorage.setItem('twin-session', JSON.stringify({ sessionId: 's1', streamIndex: 4 }))
    mount()
    expect(eve.options).toMatchObject({ initialSession: { sessionId: 's1', streamIndex: 4 }, resume: true })
    const onSessionChange = eve.options?.onSessionChange as (s: unknown) => void
    onSessionChange({ sessionId: 's1', streamIndex: 9 })
    expect(JSON.parse(window.localStorage.getItem('twin-session') ?? 'null')).toEqual({ sessionId: 's1', streamIndex: 9 })
    onSessionChange(undefined)
    expect(window.localStorage.getItem('twin-session')).toBeNull()
  })

  it('maps the messages to lines', () => {
    mount()
    update({ data: { messages: [{ id: 'u', role: 'user', parts: [{ type: 'text', text: 'hi' }] }] } })
    expect(api.lines).toEqual([{ kind: 'text', id: 'u:0', from: 'viewer', text: 'hi' }])
  })

  it('types while submitted or producing text, not while parked on an approval', () => {
    mount()
    expect(api.typing).toBe(false)
    update({ status: 'submitted' })
    expect(api.typing).toBe(true)
    update({ status: 'streaming', events: [{ type: 'turn.started' }, { type: 'message.appended' }] })
    expect(api.typing).toBe(true)
    update({ events: [...agent.events, { type: 'turn.waiting' }] })
    expect(api.typing).toBe(false)
  })

  it('sends trimmed text and ignores a blank draft', async () => {
    mount()
    await act(() => api.send('  hello  '))
    await act(() => api.send('   '))
    expect(agent.send).toHaveBeenCalledTimes(1)
    expect(agent.send).toHaveBeenCalledWith('hello')
  })

  it('explains a failed turn by the HTTP status of the client error', () => {
    mount()
    update({ status: 'error', error: new ClientError(429, '{"ok":false,"kind":"throttled"}') })
    expect(api.refusal).toBe('throttled')
    update({ error: new ClientError(403, '') })
    expect(api.refusal).toBe('ended')
    update({ error: new TypeError('Failed to fetch') })
    expect(api.refusal).toBe('offline')
  })

  it('explains a rejected follow-up send and clears the refusal on the next send', async () => {
    mount()
    agent.send.mockRejectedValueOnce(new ClientError(413, ''))
    await act(() => api.send('long'))
    expect(api.refusal).toBe('too_long')
    await act(() => api.send('short'))
    expect(api.refusal).toBeNull()
  })

  it('exposes reset, which also clears the refusal', () => {
    mount()
    update({ status: 'error', error: new ClientError(429, '') })
    expect(api.refusal).toBe('throttled')
    act(() => api.reset())
    expect(agent.reset).toHaveBeenCalled()
    expect(api.refusal).toBeNull()
  })

  it('starts a fresh session once when the saved one is gone (404), instead of staying offline', () => {
    window.localStorage.setItem('twin-session', JSON.stringify({ sessionId: 'gone', streamIndex: 3 }))
    mount()
    update({ status: 'error', error: new ClientError(404, '') })
    expect(agent.reset).toHaveBeenCalledTimes(1)
    expect(api.refusal).toBeNull()
    // A second 404 is not a stale save any more: it is explained, and never loops.
    update({ status: 'ready', error: undefined })
    update({ status: 'error', error: new ClientError(404, '') })
    expect(agent.reset).toHaveBeenCalledTimes(1)
    expect(api.refusal).toBe('offline')
  })

  it('resends once on a fresh session when a follow-up hits a session that is gone', async () => {
    mount()
    agent.send.mockRejectedValueOnce(new ClientError(404, ''))
    await act(() => api.send('hello'))
    expect(agent.reset).toHaveBeenCalledTimes(1)
    expect(agent.send).toHaveBeenCalledTimes(2)
    expect(api.refusal).toBeNull()
  })

  const userMessage = (text: string, metadata: Record<string, unknown>) => ({
    id: `m-${text}`,
    role: 'user',
    metadata,
    parts: [{ type: 'text', text }],
  })

  it('resends the visitor message once on a fresh session when a first turn fails with 404', async () => {
    mount()
    await act(() => api.send('  hello  '))
    expect(agent.send).toHaveBeenCalledTimes(1)
    // The first turn's failure surfaces through `agent.error`; the optimistic message failed with it.
    await act(async () =>
      update({
        status: 'error',
        error: new ClientError(404, ''),
        data: { messages: [userMessage('hello', { optimistic: true, status: 'failed' })] },
      }),
    )
    expect(agent.reset).toHaveBeenCalledTimes(1)
    expect(agent.send).toHaveBeenCalledTimes(2)
    expect(agent.send).toHaveBeenLastCalledWith('hello')
    expect(api.refusal).toBeNull()
    // The resent turn failing with 404 again is explained, never resent nor reset again.
    await act(async () => update({ status: 'ready', error: undefined, data: { messages: [] } }))
    await act(async () => update({ status: 'error', error: new ClientError(404, '') }))
    expect(agent.reset).toHaveBeenCalledTimes(1)
    expect(agent.send).toHaveBeenCalledTimes(2)
    expect(api.refusal).toBe('offline')
  })

  it('does not resend a message the server already acknowledged before the 404', async () => {
    mount()
    await act(() => api.send('hello'))
    await act(async () =>
      update({
        status: 'error',
        error: new ClientError(404, ''),
        data: { messages: [userMessage('hello', { status: 'complete', turnId: 't1' })] },
      }),
    )
    expect(agent.reset).toHaveBeenCalledTimes(1)
    expect(agent.send).toHaveBeenCalledTimes(1)
  })

  it('does not resend anything when the 404 comes from a resumed session with nothing sent', async () => {
    window.localStorage.setItem('twin-session', JSON.stringify({ sessionId: 'gone', streamIndex: 3 }))
    mount()
    await act(async () => update({ status: 'error', error: new ClientError(404, '') }))
    expect(agent.reset).toHaveBeenCalledTimes(1)
    expect(agent.send).not.toHaveBeenCalled()
  })

  it('a follow-up 404 resends once from send, not again from the error path', async () => {
    mount()
    agent.send.mockRejectedValueOnce(new ClientError(404, ''))
    await act(() => api.send('hello'))
    expect(agent.send).toHaveBeenCalledTimes(2)
    await act(async () => update({ status: 'error', error: new ClientError(404, '') }))
    expect(agent.send).toHaveBeenCalledTimes(2)
  })

  it('starts a fresh session and resends the unanswered message when the session fails for good', async () => {
    mount()
    await act(async () => api.send('oi'))
    expect(agent.send).toHaveBeenCalledTimes(1)
    update({ events: [{ type: 'turn.started' }, { type: 'session.failed' }] })
    expect(agent.reset).toHaveBeenCalledTimes(1)
    expect(agent.send).toHaveBeenCalledTimes(2)
    expect(agent.send).toHaveBeenLastCalledWith('oi')
    expect(api.refusal).toBeNull()
  })

  it('renews a saved session that already failed without resending anything', () => {
    window.localStorage.setItem('twin-session', JSON.stringify({ sessionId: 's1', streamIndex: 4 }))
    mount()
    update({ events: [{ type: 'session.failed' }] })
    expect(agent.reset).toHaveBeenCalledTimes(1)
    expect(agent.send).not.toHaveBeenCalled()
  })

  it('renews at most once, then explains a second failure as offline', async () => {
    mount()
    update({ events: [{ type: 'session.failed' }] })
    update({ events: [] })
    update({ events: [{ type: 'session.failed' }], error: new Error('failed') })
    expect(agent.reset).toHaveBeenCalledTimes(1)
    expect(api.refusal).toBe('offline')
  })

  it('starts a fresh session when a saved one never finishes resuming', () => {
    vi.useFakeTimers()
    try {
      window.localStorage.setItem('twin-session', JSON.stringify({ sessionId: 's1', streamIndex: 4 }))
      agent = { ...fresh(), status: 'resuming' }
      eve.agent = agent
      mount()
      act(() => vi.advanceTimersByTime(9_000))
      expect(agent.reset).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(2_000))
      expect(agent.reset).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('holds a message sent while resuming and delivers it once the resume settles', async () => {
    agent = { ...fresh(), status: 'resuming' }
    eve.agent = agent
    mount()
    await act(async () => api.send('oi'))
    expect(agent.send).not.toHaveBeenCalled()
    expect(api.refusal).toBeNull()
    await act(async () => update({ status: 'ready' }))
    expect(agent.send).toHaveBeenCalledTimes(1)
    expect(agent.send).toHaveBeenCalledWith('oi')
  })

  it('delivers a held message to the fresh session when the stuck resume is renewed', async () => {
    vi.useFakeTimers()
    try {
      window.localStorage.setItem('twin-session', JSON.stringify({ sessionId: 's1', streamIndex: 4 }))
      agent = { ...fresh(), status: 'resuming' }
      eve.agent = agent
      mount()
      await act(async () => api.send('oi'))
      expect(agent.send).not.toHaveBeenCalled()
      await act(async () => vi.advanceTimersByTime(10_000))
      expect(agent.reset).toHaveBeenCalledTimes(1)
      await act(async () => update({ status: 'ready' }))
      expect(agent.send).toHaveBeenCalledTimes(1)
      expect(agent.send).toHaveBeenCalledWith('oi')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('useTwin first reply timing', () => {
  const said = (id: string, role: 'user' | 'assistant', text: string) => ({ id, role, parts: [{ type: 'text', text }] })
  const experiences = () => track.mock.calls.filter(([event]) => String(event).startsWith('experience_'))
  let t = 0

  beforeEach(() => {
    t = 0
    vi.spyOn(performance, 'now').mockImplementation(() => t)
  })
  afterEach(() => vi.restoreAllMocks())

  it('is ready when the twin first shows text after the send, not for an earlier reply', async () => {
    agent.data = { messages: [said('u0', 'user', 'hey'), said('a0', 'assistant', 'Hi!')] }
    mount()
    t = 1_000
    await act(() => api.send('how are you?'))
    update({ data: { messages: [...agent.data.messages, said('u1', 'user', 'how are you?')] } })
    update({ data: { messages: [...agent.data.messages, said('a1', 'assistant', '')] } })
    expect(experiences()).toEqual([])
    t = 3_500
    update({ data: { messages: [...agent.data.messages.slice(0, 3), said('a1', 'assistant', 'Good, you?')] } })
    t = 4_000
    update({ data: { messages: [...agent.data.messages.slice(0, 3), said('a1', 'assistant', 'Good, you?\n\nBusy day.')] } })
    expect(experiences()).toEqual([['experience_ready', { experience: 'twin_first_reply', ms: 2_500 }]])
  })

  it('keeps measuring the first message when another is sent before the reply', async () => {
    mount()
    t = 100
    await act(() => api.send('one'))
    t = 200
    await act(() => api.send('two'))
    t = 900
    update({ data: { messages: [said('u1', 'user', 'one'), said('u2', 'user', 'two'), said('a1', 'assistant', 'Both!')] } })
    expect(experiences()).toEqual([['experience_ready', { experience: 'twin_first_reply', ms: 800 }]])
  })

  it('fails with the refusal kind when the turn is refused', async () => {
    mount()
    agent.send.mockRejectedValueOnce(new ClientError(429, ''))
    await act(() => api.send('hi'))
    expect(experiences()).toEqual([['experience_failed', { experience: 'twin_first_reply', reason: 'throttled' }]])
  })

  it('fails with the refusal kind when a first turn fails through the agent error', async () => {
    mount()
    await act(() => api.send('hi'))
    update({ status: 'error', error: new ClientError(413, '') })
    expect(experiences()).toEqual([['experience_failed', { experience: 'twin_first_reply', reason: 'too_long' }]])
  })

  it('keeps measuring across a renewed session and its resend', async () => {
    mount()
    agent.send.mockRejectedValueOnce(new ClientError(404, ''))
    await act(() => api.send('hello'))
    expect(agent.reset).toHaveBeenCalledTimes(1)
    t = 2_000
    update({ data: { messages: [said('u9', 'user', 'hello'), said('a9', 'assistant', 'Hello!')] } })
    expect(experiences()).toEqual([['experience_ready', { experience: 'twin_first_reply', ms: 2_000 }]])
  })

  it('gives up as timeout after 60 s without a reply, and a late reply reports nothing more', async () => {
    vi.useFakeTimers()
    try {
      mount()
      await act(() => api.send('hi'))
      act(() => vi.advanceTimersByTime(59_999))
      expect(experiences()).toEqual([])
      act(() => vi.advanceTimersByTime(1))
      expect(experiences()).toEqual([['experience_failed', { experience: 'twin_first_reply', reason: 'timeout' }]])
      update({ data: { messages: [said('a1', 'assistant', 'Sorry, late.')] } })
      expect(experiences()).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports nothing once the window closes before the reply', async () => {
    vi.useFakeTimers()
    try {
      mount()
      await act(() => api.send('hi'))
      act(() => root.unmount())
      act(() => vi.advanceTimersByTime(60_000))
      expect(experiences()).toEqual([])
      root = createRoot(host)
    } finally {
      vi.useRealTimers()
    }
  })
})
