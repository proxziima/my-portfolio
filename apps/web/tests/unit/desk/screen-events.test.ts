// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchScreen } from '@/features/desk/screen-events'

let iframe: HTMLIFrameElement
const onChange = vi.fn()
let unwatch: () => void

const fire = (target: EventTarget, type: string) => target.dispatchEvent(new Event(type, { bubbles: true }))

beforeEach(() => {
  iframe = document.createElement('iframe')
  document.body.append(iframe)
  onChange.mockClear()
  unwatch = watchScreen(iframe, onChange)
})

afterEach(() => {
  unwatch()
  iframe.remove()
})

describe('watchScreen', () => {
  it('reports entering and leaving once each', () => {
    fire(iframe, 'pointerenter')
    fire(iframe, 'pointerenter')
    expect(onChange.mock.calls).toEqual([[true]])
    fire(iframe, 'pointerleave')
    expect(onChange.mock.calls).toEqual([[true], [false]])
  })

  it('holds the monitor through a drag that ends outside', () => {
    fire(iframe, 'pointerenter')
    fire(iframe, 'load') // the same-origin document is ready: its window is now watched
    const inner = iframe.contentWindow
    if (!inner) throw new Error('jsdom gave the iframe no window')
    fire(inner, 'pointerdown')
    fire(iframe, 'pointerleave')
    expect(onChange).toHaveBeenLastCalledWith(true)
    fire(window, 'pointerup')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('a cancelled press releases the monitor too', () => {
    fire(iframe, 'pointerenter')
    fire(iframe, 'load')
    const inner = iframe.contentWindow
    if (!inner) throw new Error('jsdom gave the iframe no window')
    fire(inner, 'pointerdown')
    fire(iframe, 'pointerleave')
    expect(onChange).toHaveBeenLastCalledWith(true)
    fire(inner, 'pointercancel')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('ignores focus that arrives while the pointer is already over the screen', () => {
    fire(iframe, 'pointerenter')
    fire(iframe, 'focus')
    fire(iframe, 'pointerleave')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('treats keyboard focus as hovering', () => {
    fire(iframe, 'focus')
    expect(onChange).toHaveBeenLastCalledWith(true)
    fire(iframe, 'blur')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('stops listening once unsubscribed', () => {
    unwatch()
    fire(iframe, 'pointerenter')
    expect(onChange).not.toHaveBeenCalled()
    unwatch = () => {}
  })
})
