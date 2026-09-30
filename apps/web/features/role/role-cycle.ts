/** Modulo that is never negative, so an unbounded position maps onto an index. */
export const mod = (n: number, m: number): number => ((n % m) + m) % m

/** Signed number of steps from `from` to `to` on a ring of `count`, the short way round. */
export function shortestDelta(from: number, to: number, count: number): number {
  const d = mod(to - from, count)
  return d > count / 2 ? d - count : d
}
