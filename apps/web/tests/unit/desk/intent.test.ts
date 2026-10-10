// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VISIBLE_RATIO, watchApproach } from '@/features/desk/intent'

/** Records its options and target, and lets the test report an intersection ratio. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  readonly observed: Element[] = []
  readonly disconnect = vi.fn()
  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    FakeIntersectionObserver.instances.push(this)
  }
  observe(target: Element) {
    this.observed.push(target)
  }
  unobserve() {}
  takeRecords() {
    return []
  }
  trigger(ratio: number) {
    const entries = this.observed.map((target) => ({ target, intersectionRatio: ratio, isIntersecting: ratio > 0 }) as IntersectionObserverEntry)
    this.callback(entries, this as unknown as IntersectionObserver)
  }
}

/** jsdom has no PointerEvent constructor: a plain event carrying `pointerType`. */
function pointer(type: string, pointerType: string): Event {
  const e = new Event(type)
  Object.defineProperty(e, 'pointerType', { value: pointerType })
  return e
}

const focusIn = () => new FocusEvent('focusin', { bubbles: true })

let box: HTMLDivElement
let screen: HTMLDivElement
let onApproach: ReturnType<typeof vi.fn>

beforeEach(() => {
  FakeIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  box = document.createElement('div')
  screen = document.createElement('div')
  screen.tabIndex = 0
  box.append(screen)
  document.body.append(box)
  onApproach = vi.fn()
})

afterEach(() => {
  box.remove()
  vi.unstubAllGlobals()
})

describe('watchApproach with a pointer', () => {
  it('fires once when a mouse enters the box', () => {
    watchApproach(box, screen, false, onApproach)
    box.dispatchEvent(pointer('pointerenter', 'mouse'))
    box.dispatchEvent(pointer('pointerenter', 'mouse'))
    expect(onApproach).toHaveBeenCalledTimes(1)
    expect(onApproach).toHaveBeenCalledWith('pointer')
  })

  it('a pen counts as a pointer', () => {
    watchApproach(box, screen, false, onApproach)
    box.dispatchEvent(pointer('pointerenter', 'pen'))
    expect(onApproach).toHaveBeenCalledWith('pointer')
  })

  it('creates no IntersectionObserver', () => {
    watchApproach(box, screen, false, onApproach)
    expect(FakeIntersectionObserver.instances).toHaveLength(0)
  })

  it('fires on keyboard focus reaching the screen', () => {
    watchApproach(box, screen, false, onApproach)
    screen.dispatchEvent(focusIn())
    expect(onApproach).toHaveBeenCalledWith('focus')
  })
})

describe('watchApproach on touch', () => {
  it('observes the box with a threshold at half in view', () => {
    watchApproach(box, screen, true, onApproach)
    const io = FakeIntersectionObserver.instances[0]!
    expect(io.observed).toEqual([box])
    expect([io.options.threshold].flat()).toContain(VISIBLE_RATIO)
    expect(VISIBLE_RATIO).toBe(0.5)
  })

  it('fires `visible` at once when half the box is in view, with no timer', () => {
    vi.useFakeTimers()
    try {
      watchApproach(box, screen, true, onApproach)
      FakeIntersectionObserver.instances[0]!.trigger(0.5)
      expect(onApproach).toHaveBeenCalledWith('visible')
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores less than half, then fires when more comes into view', () => {
    watchApproach(box, screen, true, onApproach)
    const io = FakeIntersectionObserver.instances[0]!
    io.trigger(0.49)
    expect(onApproach).not.toHaveBeenCalled()
    io.trigger(0.6)
    expect(onApproach).toHaveBeenCalledTimes(1)
    expect(onApproach).toHaveBeenCalledWith('visible')
  })

  it('has no tap trigger', () => {
    watchApproach(box, screen, true, onApproach)
    box.dispatchEvent(pointer('pointerenter', 'touch'))
    box.dispatchEvent(pointer('pointerdown', 'touch'))
    screen.dispatchEvent(pointer('pointerdown', 'touch'))
    expect(onApproach).not.toHaveBeenCalled()
  })

  it('fires on keyboard focus reaching the screen', () => {
    watchApproach(box, screen, true, onApproach)
    screen.dispatchEvent(focusIn())
    expect(onApproach).toHaveBeenCalledWith('focus')
  })
})

describe('watchApproach cleanup', () => {
  it('removes the listeners and disconnects the observer', () => {
    const stop = watchApproach(box, screen, true, onApproach)
    const io = FakeIntersectionObserver.instances[0]!
    stop()
    expect(io.disconnect).toHaveBeenCalled()
    screen.dispatchEvent(focusIn())
    expect(onApproach).not.toHaveBeenCalled()

    const stopPointer = watchApproach(box, screen, false, onApproach)
    stopPointer()
    box.dispatchEvent(pointer('pointerenter', 'mouse'))
    expect(onApproach).not.toHaveBeenCalled()
  })

  it('has already cleaned up once it fired', () => {
    watchApproach(box, screen, true, onApproach)
    const io = FakeIntersectionObserver.instances[0]!
    screen.dispatchEvent(focusIn())
    expect(io.disconnect).toHaveBeenCalled()
    io.trigger(1)
    expect(onApproach).toHaveBeenCalledTimes(1)
  })
})
