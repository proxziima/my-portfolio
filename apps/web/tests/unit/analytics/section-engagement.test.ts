// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackSectionEngagement } from '@/lib/analytics/section-engagement'

type Callback = (entries: Array<{ isIntersecting: boolean; target: Element }>) => void
let fire: Callback
let options: IntersectionObserverInit | undefined
const disconnect = vi.fn()
const observed: Element[] = []
let t = 0
let visibility: DocumentVisibilityState = 'visible'

beforeEach(() => {
  t = 0
  visibility = 'visible'
  vi.spyOn(performance, 'now').mockImplementation(() => t)
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: Callback, init?: IntersectionObserverInit) {
        fire = cb
        options = init
      }
      observe(el: Element) {
        observed.push(el)
      }
      disconnect = disconnect
    },
  )
  document.body.innerHTML = `
    <section id="work" aria-labelledby="work-title"><h2 id="work-title">Work</h2></section>
    <section id="projects" aria-labelledby="projects-title"><h2 id="projects-title">Projects</h2></section>
    <section></section>`
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  observed.length = 0
})

const [work, projects] = [() => observed[0]!, () => observed[1]!]
const hide = () => {
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
}
const show = () => {
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('trackSectionEngagement', () => {
  it('reports engaged seconds per page section on exit, skipping sections under a second', () => {
    const send = vi.fn()
    const stop = trackSectionEngagement(send)
    expect(observed).toHaveLength(2)
    expect(options?.threshold).toBe(0.5)
    fire([{ isIntersecting: true, target: work() }])
    t = 4_000
    fire([{ isIntersecting: false, target: work() }, { isIntersecting: true, target: projects() }])
    t = 4_500
    window.dispatchEvent(new Event('pagehide'))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('section_engaged', { section: 'work', seconds: 4 })
    stop()
    expect(disconnect).toHaveBeenCalled()
  })

  it('resets after each exit, and the time hidden does not count', () => {
    const send = vi.fn()
    trackSectionEngagement(send)
    fire([{ isIntersecting: true, target: work() }])
    t = 2_000
    hide()
    expect(send).toHaveBeenLastCalledWith('section_engaged', { section: 'work', seconds: 2 })
    t = 20_000
    show()
    t = 23_000
    window.dispatchEvent(new Event('pagehide'))
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith('section_engaged', { section: 'work', seconds: 3 })
  })

  it('stops counting a section IDLE_MS after the last input, and input revives it', () => {
    const send = vi.fn()
    trackSectionEngagement(send)
    fire([{ isIntersecting: true, target: work() }])
    t = 100_000
    window.dispatchEvent(new Event('scroll'))
    t = 102_000
    window.dispatchEvent(new Event('pagehide'))
    expect(send).toHaveBeenCalledWith('section_engaged', { section: 'work', seconds: 32 })
  })

  it('reports nothing once stopped', () => {
    const send = vi.fn()
    const stop = trackSectionEngagement(send)
    fire([{ isIntersecting: true, target: work() }])
    t = 5_000
    stop()
    window.dispatchEvent(new Event('pagehide'))
    expect(send).not.toHaveBeenCalled()
  })
})
