// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMonitorScreen, type MonitorScreen } from '@/features/desk/monitor-screen'
import { ASSETS } from '@/lib/assets/manifest'
import { fallbackSrc, srcset } from '@/lib/assets/srcset'

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
    // the still layers decode at once here; their own block covers a slow decode
    HTMLImageElement.prototype.decode = () => Promise.resolve()
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
  /** ...and the layers turn ready (once the still layers have decoded). */
  const showDesktop = async () => {
    addDesktop()
    screen.iframe!.dispatchEvent(new Event('load'))
    await vi.waitFor(() => expect(fx().dataset.ready).toBe('true'))
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

  it('get every encode, in the manifest order, once the desktop shows', async () => {
    await showDesktop()
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

  it('do not play before they have sources, and start once they do if asked to', async () => {
    screen.play()
    expect(play).not.toHaveBeenCalled()
    await showDesktop()
    expect(play).toHaveBeenCalledTimes(2)
  })

  it('stay paused at ready when the figure is off screen, and play on request', async () => {
    screen.play()
    screen.pause()
    await showDesktop()
    expect(play).not.toHaveBeenCalled()
    screen.play()
    expect(play).toHaveBeenCalledTimes(2)
  })

  it('drop their sources on dispose and reload to release the decoder', async () => {
    await showDesktop()
    load.mockClear()
    screen.dispose()
    for (const v of videos()) expect(v.querySelectorAll('source')).toHaveLength(0)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('neither fetch nor play under reduced motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }) as MediaQueryList)
    try {
      screen.play()
      await showDesktop()
      expect(play).not.toHaveBeenCalled()
      for (const v of videos()) expect(v.querySelectorAll('source')).toHaveLength(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('the still layers (inner shadow, smudges)', () => {
  let screen: MonitorScreen
  let osDoc: Document
  /** Resolves each <img>'s decode() by hand, like a slow network would. */
  let decodes: Array<() => void>

  beforeEach(() => {
    decodes = []
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    HTMLImageElement.prototype.decode = function () {
      return new Promise<void>((resolve) => decodes.push(resolve))
    }
    screen = createMonitorScreen('/os')
    document.body.append(screen.css.element)
    osDoc = document.implementation.createHTMLDocument('os')
  })

  afterEach(() => {
    screen.dispose()
    vi.restoreAllMocks()
  })

  const fx = () => screen.css.element.querySelector<HTMLElement>('.screen-fx')!
  const imgs = () => [...screen.css.element.querySelectorAll('img')]
  const powerOn = () => Object.defineProperty(screen.powerOn(), 'contentDocument', { get: () => osDoc })
  const showDesktop = () => {
    const desktop = osDoc.createElement('div')
    desktop.dataset.anchor = 'desktop'
    osDoc.body.append(desktop)
    screen.iframe!.dispatchEvent(new Event('load'))
  }

  it('download nothing while the screen is powered off: no source, srcset or src', () => {
    expect(imgs().map((i) => i.className)).toEqual(['screen-shadow', 'screen-smudges'])
    for (const img of imgs()) {
      expect(img.getAttribute('src')).toBeNull()
      expect(img.getAttribute('srcset')).toBeNull()
    }
    expect(screen.css.element.querySelectorAll('picture source')).toHaveLength(0)
  })

  it('get their candidates on power-on, the AVIF <source> ahead of the <img>', () => {
    powerOn()
    const assets = [ASSETS.desk.screen.shadow, ASSETS.desk.screen.smudges]
    for (const [i, img] of imgs().entries()) {
      const asset = assets[i]!
      const source = img.previousElementSibling as HTMLSourceElement
      expect(source.tagName).toBe('SOURCE')
      expect(source.type).toBe('image/avif')
      expect(source.srcset).toBe(srcset(asset, 'avif'))
      expect(source.sizes).toBe('1280px')
      expect(img.srcset).toBe(srcset(asset, 'fallback'))
      expect(img.getAttribute('src')).toBe(fallbackSrc(asset))
      expect(img.sizes).toBe('1280px')
    }
  })

  it('get them once, however often the screen powers on', () => {
    powerOn()
    screen.powerOn()
    expect(screen.css.element.querySelectorAll('picture source')).toHaveLength(2)
  })

  it('hold the fade-in until both are decoded, even when the desktop shows first', async () => {
    powerOn()
    showDesktop()
    await Promise.resolve()
    expect(fx().dataset.ready).toBe('false')
    decodes[0]!()
    await Promise.resolve()
    expect(fx().dataset.ready).toBe('false')
    decodes[1]!()
    await vi.waitFor(() => expect(fx().dataset.ready).toBe('true'))
  })

  it('never hold the layers back for good: an image that fails to decode lets them fade in', async () => {
    HTMLImageElement.prototype.decode = () => Promise.reject(new Error('EncodingError'))
    powerOn()
    showDesktop()
    await vi.waitFor(() => expect(fx().dataset.ready).toBe('true'))
  })

  it('do not make the layers show while the OS boots once they are decoded', async () => {
    powerOn()
    for (const d of decodes) d()
    screen.iframe!.dispatchEvent(new Event('load'))
    await new Promise((r) => setTimeout(r, 0))
    expect(fx().dataset.ready).toBe('false')
  })
})

describe('the power', () => {
  let screen: MonitorScreen

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    HTMLImageElement.prototype.decode = () => Promise.resolve()
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
