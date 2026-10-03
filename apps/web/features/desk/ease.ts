export type Easing = (t: number) => number

export const quinticInOut: Easing = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2)

/**
 * CSS `cubic-bezier(x1, y1, x2, y2)` as a function of progress: solve the curve's x for the
 * parameter (Newton's method, bisection when the slope is flat), then read y there.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const coef = (p1: number, p2: number) => ({ a: 1 - 3 * p2 + 3 * p1, b: 3 * p2 - 6 * p1, c: 3 * p1 })
  const cx = coef(x1, x2)
  const cy = coef(y1, y2)
  const at = (t: number, { a, b, c }: { a: number; b: number; c: number }) => ((a * t + b) * t + c) * t
  const slope = (t: number) => 3 * cx.a * t * t + 2 * cx.b * t + cx.c

  const solve = (x: number): number => {
    let t = x
    for (let i = 0; i < 8; i++) {
      const s = slope(t)
      if (s < 1e-6) break
      const err = at(t, cx) - x
      if (Math.abs(err) < 1e-7) return t
      t -= err / s
    }
    let lo = 0
    let hi = 1
    for (let i = 0; i < 32; i++) {
      t = (lo + hi) / 2
      if (at(t, cx) < x) lo = t
      else hi = t
    }
    return t
  }

  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    return at(solve(x), cy)
  }
}
