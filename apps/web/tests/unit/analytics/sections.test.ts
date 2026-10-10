// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { observeSections } from '@/lib/analytics/sections'

type Callback = (entries: Array<{ isIntersecting: boolean; target: Element }>) => void
let fire: Callback
const disconnect = vi.fn()
const observed: Element[] = []

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: Callback, public options: IntersectionObserverInit) {
        fire = cb
      }
      observe(el: Element) {
        observed.push(el)
      }
      unobserve = vi.fn()
      disconnect = disconnect
    },
  )
  document.body.innerHTML = `
    <section id="work" aria-labelledby="work-title"><h2 id="work-title">Work</h2></section>
    <section id="projects" aria-labelledby="projects-title"><h2 id="projects-title">Projects</h2></section>
    <section aria-labelledby="whats-new"></section>
    <section></section>`
})
afterEach(() => {
  vi.unstubAllGlobals()
  observed.length = 0
})

describe('observeSections', () => {
  it('observes the page sections (id plus label) only and reports each once by id', () => {
    const track = vi.fn()
    const stop = observeSections(track)
    expect(observed).toHaveLength(2)
    fire([{ isIntersecting: true, target: observed[0]! }])
    fire([{ isIntersecting: true, target: observed[0]! }, { isIntersecting: false, target: observed[1]! }])
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('section_viewed', { section: 'work' })
    stop()
    expect(disconnect).toHaveBeenCalled()
  })
})
