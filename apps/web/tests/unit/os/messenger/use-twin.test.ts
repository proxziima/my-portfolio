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

  it('exposes reset', () => {
    mount()
    api.reset()
    expect(agent.reset).toHaveBeenCalled()
  })
})
