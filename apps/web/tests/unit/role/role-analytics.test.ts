// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Discipline } from '@/lib/cms/types'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const m = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock('@/lib/analytics/events', () => ({ track: m.track }))

const { RoleProvider, useRole } = await import('@/features/role/RoleProvider')

const disciplines: Discipline[] = ['a', 'b', 'c'].map((slug) => ({ slug, title: slug, level: '', caption: '', bio: [], notes: [] }))

let host: HTMLElement
let root: Root
let role: ReturnType<typeof useRole>

function Probe() {
  role = useRole()
  return null
}

const render = () =>
  act(() => root.render(createElement(RoleProvider, { disciplines, defaultSlug: 'a', children: createElement(Probe) })))
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  history.replaceState(null, '', '/')
  localStorage.clear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('role_selected', () => {
  it('fires once with the final role after rapid steps settle', () => {
    render()
    act(() => role.step(1))
    advance(200)
    act(() => role.step(1))
    advance(200)
    act(() => role.step(1))
    advance(200)
    act(() => role.step(1))
    expect(m.track).not.toHaveBeenCalled()
    advance(799)
    expect(m.track).not.toHaveBeenCalled()
    advance(1)
    expect(m.track).toHaveBeenCalledTimes(1)
    expect(m.track).toHaveBeenCalledWith('role_selected', { role: 'b' })
  })

  it('reports the settled slug when the spin ends elsewhere', () => {
    render()
    act(() => role.step(1))
    advance(100)
    act(() => role.step(1))
    advance(800)
    expect(m.track).toHaveBeenCalledTimes(1)
    expect(m.track).toHaveBeenCalledWith('role_selected', { role: 'c' })
  })

  it('fires once for a select', () => {
    render()
    act(() => role.select('b'))
    advance(800)
    expect(m.track).toHaveBeenCalledTimes(1)
    expect(m.track).toHaveBeenCalledWith('role_selected', { role: 'b' })
  })

  it('ignores an unknown slug', () => {
    render()
    act(() => role.select('nope'))
    advance(800)
    expect(m.track).not.toHaveBeenCalled()
  })

  it('does not fire for the hydrated role or the initial render', () => {
    localStorage.setItem('role', 'c')
    render()
    expect(role.current.slug).toBe('c')
    advance(2000)
    expect(m.track).not.toHaveBeenCalled()
  })

  it('does not fire when the spin returns to the starting role', () => {
    render()
    act(() => role.step(1))
    advance(100)
    act(() => role.step(-1))
    advance(800)
    expect(m.track).not.toHaveBeenCalled()
  })

  it('measures a later interaction from the previously settled role', () => {
    render()
    act(() => role.select('b'))
    advance(800)
    act(() => role.select('a'))
    advance(800)
    expect(m.track.mock.calls).toEqual([
      ['role_selected', { role: 'b' }],
      ['role_selected', { role: 'a' }],
    ])
  })

  it('drops a pending event on unmount', () => {
    render()
    act(() => role.step(1))
    act(() => root.unmount())
    advance(800)
    expect(m.track).not.toHaveBeenCalled()
    root = createRoot(host)
  })
})
