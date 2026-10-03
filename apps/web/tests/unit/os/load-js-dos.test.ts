// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Loader = typeof import('@/features/os/apps/dos/load-js-dos')

/** A fresh module per test: the loader caches its promise at module scope. */
let loadJsDos: Loader['loadJsDos']

const scripts = () => document.head.querySelectorAll('script[src="/js-dos/js-dos.js"]')
const links = () => document.head.querySelectorAll('link[rel="stylesheet"][href="/js-dos/js-dos.css"]')

beforeEach(async () => {
  vi.resetModules()
  ;({ loadJsDos } = await import('@/features/os/apps/dos/load-js-dos'))
})

afterEach(() => {
  document.head.innerHTML = ''
  delete window.emulators
})

describe('loadJsDos', () => {
  it('adds the script and the stylesheet once, however many windows ask', () => {
    const first = loadJsDos()
    const second = loadJsDos()
    expect(second).toBe(first)
    expect(scripts()).toHaveLength(1)
    expect(links()).toHaveLength(1)
  })

  it('resolves when the script loads, pointing the emulator at /js-dos/', async () => {
    const loading = loadJsDos()
    window.emulators = { pathPrefix: '' }
    scripts()[0]!.dispatchEvent(new Event('load'))
    await expect(loading).resolves.toBeUndefined()
    expect(window.emulators.pathPrefix).toBe('/js-dos/')
  })

  it('rejects when the script fails, and lets a later window try again', async () => {
    const loading = loadJsDos()
    scripts()[0]!.dispatchEvent(new Event('error'))
    await expect(loading).rejects.toThrow('js-dos failed to load')
    expect(scripts()).toHaveLength(0)
    loadJsDos().catch(() => {})
    expect(scripts()).toHaveLength(1)
  })
})
