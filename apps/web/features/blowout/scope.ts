/** Everything one blowout creates — timers, frames, animations, elements — so it can all be torn down at once. */
export interface Scope {
  later(fn: () => void, ms: number): void
  frame(fn: (now: number) => void): void
  /** Appends `el` to `body` and owns it until `release` or `dispose`. */
  own<T extends HTMLElement>(el: T): T
  release(el: HTMLElement): void
  animate(el: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation | null
  /** Cancels what is pending and removes what is owned; the scope is inert afterwards. */
  dispose(): void
}

export function createScope(): Scope {
  const timers = new Set<number>()
  const frames = new Set<number>()
  const nodes = new Set<HTMLElement>()
  const animations = new Set<Animation>()
  let disposed = false
  return {
    later(fn, ms) {
      if (disposed) return
      const id = window.setTimeout(() => { timers.delete(id); fn() }, ms)
      timers.add(id)
    },
    frame(fn) {
      if (disposed) return
      const id = requestAnimationFrame((now) => { frames.delete(id); fn(now) })
      frames.add(id)
    },
    own(el) {
      if (disposed) return el
      nodes.add(el)
      document.body.appendChild(el)
      return el
    },
    release(el) {
      nodes.delete(el)
      el.remove()
    },
    animate(el, keyframes, options) {
      if (disposed || typeof el.animate !== 'function') return null
      const a = el.animate(keyframes, options)
      animations.add(a)
      a.addEventListener('finish', () => animations.delete(a))
      return a
    },
    dispose() {
      disposed = true
      timers.forEach((id) => window.clearTimeout(id))
      frames.forEach((id) => cancelAnimationFrame(id))
      animations.forEach((a) => a.cancel())
      nodes.forEach((el) => el.remove())
      timers.clear()
      frames.clear()
      animations.clear()
      nodes.clear()
    },
  }
}
