// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchScreen } from '@/features/desk/screen-events'

/** The screen slab: enter, leave and focus come from it; the iframe appears inside it on power-on. */
let element: HTMLDivElement
let iframe: HTMLIFrameElement
const onChange = vi.fn()
const onInput = vi.fn()
let unwatch: () => void

const fire = (target: EventTarget, type: string) => target.dispatchEvent(new Event(type, { bubbles: true }))
/** As the browser fires it: `load` does not bubble. */
const load = (target: EventTarget) => target.dispatchEvent(new Event('load'))

beforeEach(() => {
  element = document.createElement('div')
  element.tabIndex = 0
  document.body.append(element)
  onChange.mockClear()
  onInput.mockClear()
  unwatch = watchScreen(element, onChange, onInput)
  // powered on after the watch started, as on the desk
  iframe = document.createElement('iframe')
  element.append(iframe)
})

afterEach(() => {
  unwatch()
  element.remove()
})

describe('watchScreen', () => {
  it('reports entering and leaving once each', () => {
    fire(element, 'pointerenter')
    fire(element, 'pointerenter')
    expect(onChange.mock.calls).toEqual([[true]])
    fire(element, 'pointerleave')
    expect(onChange.mock.calls).toEqual([[true], [false]])
  })

  it('holds the monitor through a drag that ends outside', () => {
    fire(element, 'pointerenter')
    load(iframe) // the same-origin document is ready: its window is now watched
    const inner = iframe.contentWindow
    if (!inner) throw new Error('jsdom gave the iframe no window')
    fire(inner, 'pointerdown')
    fire(element, 'pointerleave')
    expect(onChange).toHaveBeenLastCalledWith(true)
    fire(window, 'pointerup')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('a cancelled press releases the monitor too', () => {
    fire(element, 'pointerenter')
    load(iframe)
    const inner = iframe.contentWindow
    if (!inner) throw new Error('jsdom gave the iframe no window')
    fire(inner, 'pointerdown')
    fire(element, 'pointerleave')
    expect(onChange).toHaveBeenLastCalledWith(true)
    fire(inner, 'pointercancel')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('ignores focus that arrives while the pointer is already over the screen', () => {
    fire(element, 'pointerenter')
    fire(element, 'focusin')
    fire(element, 'pointerleave')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('treats keyboard focus as hovering', () => {
    fire(element, 'focusin')
    expect(onChange).toHaveBeenLastCalledWith(true)
    fire(element, 'focusout')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('reports the frame\'s presses and keys as inputs', () => {
    load(iframe)
    const inner = iframe.contentWindow
    if (!inner) throw new Error('jsdom gave the iframe no window')
    inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', repeat: false, bubbles: true }))
    inner.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))
    fire(inner, 'pointerdown')
    fire(inner, 'pointerup')
    expect(onInput.mock.calls.map((c) => c[0])).toEqual([
      { type: 'keydown', key: 'a', repeat: false },
      { type: 'keyup', key: 'a', repeat: false },
      { type: 'pointerdown', key: '', repeat: false },
      { type: 'pointerup', key: '', repeat: false },
    ])
  })

  it('counts focus moving from the slab into the OS as one stay', () => {
    fire(element, 'focusin')
    expect(onChange.mock.calls).toEqual([[true]])
    // the hand-over on load: the slab blurs toward the iframe inside it, which takes focus
    element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: iframe }))
    iframe.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: element }))
    expect(onChange.mock.calls).toEqual([[true]])
    fire(iframe, 'focusout')
    expect(onChange.mock.calls).toEqual([[true], [false]])
  })

  it('watches the window of an iframe that appears after the watch started', () => {
    const late = document.createElement('iframe')
    element.append(late)
    load(late)
    const inner = late.contentWindow
    if (!inner) throw new Error('jsdom gave the iframe no window')
    fire(inner, 'pointerdown')
    expect(onInput).toHaveBeenCalledWith({ type: 'pointerdown', key: '', repeat: false })
  })

  it('ignores loads of the images in the CRT layers', () => {
    const img = document.createElement('img')
    element.append(img)
    expect(() => load(img)).not.toThrow()
    expect(onInput).not.toHaveBeenCalled()
  })

  it('stops listening once unsubscribed', () => {
    unwatch()
    fire(element, 'pointerenter')
    expect(onChange).not.toHaveBeenCalled()
    unwatch = () => {}
  })
})
