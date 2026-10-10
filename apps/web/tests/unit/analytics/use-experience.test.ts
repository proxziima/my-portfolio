// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExperienceTimer } from '@/lib/analytics/experience'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const track = vi.hoisted(() => vi.fn())
vi.mock('@/lib/analytics/events', () => ({ track }))

const { useExperience } = await import('@/lib/analytics/use-experience')

let host: HTMLElement
let root: Root
let timer: ExperienceTimer
let t = 0

/** Settles the parent's timer from its own effect, which runs before the parent's effects do. */
function Child({ onMount }: { onMount: () => void }) {
  useEffect(onMount, [onMount])
  return null
}

function Harness({ active, app, settleInChild }: { active?: boolean; app?: string; settleInChild?: boolean }) {
  timer = useExperience('dos_app', { active, app })
  return settleInChild ? createElement(Child, { onMount: timer.ready }) : null
}

const render = (props: Parameters<typeof Harness>[0] = {}) => act(() => root.render(createElement(Harness, props)))

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  t = 0
  vi.spyOn(performance, 'now').mockImplementation(() => t)
  track.mockClear()
  host = document.createElement('div')
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  vi.restoreAllMocks()
})

describe('useExperience', () => {
  it('times from the first render, with the app on the event', () => {
    t = 100
    render({ app: 'doom' })
    t = 450
    timer.ready()
    expect(track).toHaveBeenCalledWith('experience_ready', { experience: 'dos_app', ms: 350, app: 'doom' })
  })

  it('is already started when a child settles it from its own effect', () => {
    render({ settleInChild: true })
    expect(track).toHaveBeenCalledWith('experience_ready', { experience: 'dos_app', ms: 0 })
  })

  it('ignores calls until active, then starts once and keeps the same timer object', () => {
    render({ active: false })
    const first = timer
    timer.failed('load_error')
    expect(track).not.toHaveBeenCalled()
    t = 1_000
    render({ active: true })
    t = 1_200
    render({ active: false })
    render({ active: true })
    expect(timer).toBe(first)
    timer.ready()
    timer.ready()
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('experience_ready', { experience: 'dos_app', ms: 200 })
  })
})
