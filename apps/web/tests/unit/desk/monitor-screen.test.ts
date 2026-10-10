// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SCREEN } from '@/features/desk/config'
import { createMonitorScreen, screenPlanes, type MonitorScreen } from '@/features/desk/monitor-screen'
import { ASSETS } from '@/lib/assets/manifest'

describe('screenPlanes', () => {
  const { occluder, bezels } = screenPlanes(SCREEN)

  it('puts the occluder at the screen, screen-sized', () => {
    expect(occluder).toEqual({ width: SCREEN.width, height: SCREEN.height, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } })
  })

  it('encloses the screen with four bezels standing `depth` deep in front of it', () => {
    expect(bezels).toHaveLength(4)
    const half = SCREEN.depth / 2
    for (const b of bezels) expect(b.position.z).toBe(half)
    const xs = bezels.map((b) => b.position.x).sort((a, b) => a - b)
    const ys = bezels.map((b) => b.position.y).sort((a, b) => a - b)
    expect(xs).toEqual([-SCREEN.width / 2, 0, 0, SCREEN.width / 2])
    expect(ys).toEqual([-SCREEN.height / 2, 0, 0, SCREEN.height / 2])
  })

  it('turns the side bezels about y and the top/bottom about x', () => {
    const sides = bezels.filter((b) => b.position.x !== 0)
    const caps = bezels.filter((b) => b.position.y !== 0)
    for (const s of sides) expect(s).toMatchObject({ width: SCREEN.depth, height: SCREEN.height, rotation: { x: 0, y: Math.PI / 2, z: 0 } })
    for (const c of caps) expect(c).toMatchObject({ width: SCREEN.width, height: SCREEN.depth, rotation: { x: Math.PI / 2, y: 0, z: 0 } })
  })
})

describe('the static videos', () => {
  let screen: MonitorScreen
  let play: ReturnType<typeof vi.fn<() => Promise<void>>>
  let load: ReturnType<typeof vi.fn<() => void>>
  let osDoc: Document

  beforeEach(() => {
    // jsdom has no media pipeline
    play = vi.fn<() => Promise<void>>(() => Promise.resolve())
    load = vi.fn<() => void>()
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(load)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    screen = createMonitorScreen('/os')
    document.body.append(screen.css.element)
    // the OS's document, as the same-origin iframe exposes it
    osDoc = document.implementation.createHTMLDocument('os')
    Object.defineProperty(screen.powerOn(), 'contentDocument', { get: () => osDoc })
  })

  afterEach(() => {
    screen.dispose()
    vi.restoreAllMocks()
  })

  const fx = () => screen.css.element.querySelector<HTMLElement>('.screen-fx')!
  const videos = () => [...screen.css.element.querySelectorAll('video')]

  /** The OS shows its desktop: the iframe loads a document holding the desktop root. */
  const addDesktop = () => {
    const desktop = osDoc.createElement('div')
    desktop.dataset.anchor = 'desktop'
    osDoc.body.append(desktop)
  }
  const showDesktop = () => {
    addDesktop()
    screen.iframe!.dispatchEvent(new Event('load'))
  }

  it('have no sources and preload nothing until the layers can show', () => {
    expect(videos()).toHaveLength(2)
    for (const v of videos()) {
      expect(v.querySelectorAll('source')).toHaveLength(0)
      expect(v.preload).toBe('none')
      expect(v.getAttribute('src')).toBeNull()
    }
    expect(fx().dataset.ready).toBe('false')
  })

  it('get every encode, in the manifest order, once the desktop shows', () => {
    showDesktop()
    expect(fx().dataset.ready).toBe('true')
    const [base, fine] = videos()
    const expected = [ASSETS.desk.screen.staticBase, ASSETS.desk.screen.staticLayer]
    for (const [i, v] of [base!, fine!].entries()) {
      const sources = [...v.querySelectorAll('source')].map((s) => ({ src: s.getAttribute('src'), type: s.type }))
      expect(sources).toEqual(expected[i]!.sources.map((s) => ({ src: s.src, type: s.type })))
      expect(v.preload).toBe('auto')
    }
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('stay unattached while the OS boots, and attach when the desktop appears', async () => {
    screen.iframe!.dispatchEvent(new Event('load'))
    expect(fx().dataset.ready).toBe('false')
    expect(videos()[0]!.querySelectorAll('source')).toHaveLength(0)
    addDesktop()
    await vi.waitFor(() => expect(fx().dataset.ready).toBe('true'))
    expect(videos()[0]!.querySelectorAll('source').length).toBeGreaterThan(0)
  })

  it('do not play before they have sources, and start once they do if asked to', () => {
    screen.play()
    expect(play).not.toHaveBeenCalled()
    showDesktop()
    expect(play).toHaveBeenCalledTimes(2)
  })

  it('stay paused at ready when the figure is off screen, and play on request', () => {
    screen.play()
    screen.pause()
    showDesktop()
    expect(play).not.toHaveBeenCalled()
    screen.play()
    expect(play).toHaveBeenCalledTimes(2)
  })

  it('drop their sources on dispose and reload to release the decoder', () => {
    showDesktop()
    load.mockClear()
    screen.dispose()
    for (const v of videos()) expect(v.querySelectorAll('source')).toHaveLength(0)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('neither fetch nor play under reduced motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }) as MediaQueryList)
    try {
      screen.play()
      showDesktop()
      expect(play).not.toHaveBeenCalled()
      for (const v of videos()) expect(v.querySelectorAll('source')).toHaveLength(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('the power', () => {
  let screen: MonitorScreen

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    screen = createMonitorScreen('/os')
    document.body.append(screen.css.element)
  })

  afterEach(() => {
    screen.dispose()
    vi.restoreAllMocks()
  })

  it('starts powered off: a focusable picture of a dark tube, no iframe', () => {
    expect(screen.iframe).toBeNull()
    expect(screen.element.querySelector('iframe')).toBeNull()
    expect(screen.element.tabIndex).toBe(0)
    expect(screen.element.getAttribute('role')).toBe('img')
    expect(screen.element.getAttribute('aria-label')).toBe('Desktop (powered off)')
  })

  it('powers on once: one iframe of the OS, the same on a second call', () => {
    const iframe = screen.powerOn()
    expect(screen.element.querySelectorAll('iframe')).toHaveLength(1)
    expect(iframe.getAttribute('src')).toBe('/os')
    expect(iframe.title).toBe('Desktop')
    expect(screen.iframe).toBe(iframe)
    expect(screen.powerOn()).toBe(iframe)
    expect(screen.element.querySelectorAll('iframe')).toHaveLength(1)
    // under the CRT layers, as before
    expect(iframe.nextElementSibling?.classList.contains('screen-fx')).toBe(true)
  })

  it('on load, drops the tab stop and the label and reports loaded once', () => {
    const loaded = vi.fn()
    screen.onLoaded(loaded)
    const iframe = screen.powerOn()
    const focus = vi.spyOn(iframe, 'focus')
    iframe.dispatchEvent(new Event('load'))
    iframe.dispatchEvent(new Event('load')) // the OS reloading is not a second power-on
    expect(screen.element.tabIndex).toBe(-1)
    expect(screen.element.hasAttribute('role')).toBe(false)
    expect(screen.element.hasAttribute('aria-label')).toBe(false)
    expect(focus).not.toHaveBeenCalled()
    expect(loaded).toHaveBeenCalledTimes(1)
  })

  it('hands keyboard focus over to the OS when the screen still has it', () => {
    screen.element.focus()
    expect(document.activeElement).toBe(screen.element)
    const iframe = screen.powerOn()
    const focus = vi.spyOn(iframe, 'focus')
    iframe.dispatchEvent(new Event('load'))
    expect(focus).toHaveBeenCalledTimes(1)
  })
})
