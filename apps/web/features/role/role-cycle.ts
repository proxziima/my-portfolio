/** Modulo that is never negative, so an unbounded position maps onto an index. */
export const mod = (n: number, m: number): number => ((n % m) + m) % m

/** Signed number of steps from `from` to `to` on a ring of `count`, the short way round. */
export function shortestDelta(from: number, to: number, count: number): number {
  const d = mod(to - from, count)
  return d > count / 2 ? d - count : d
}

/**
 * Which of the three visible picker rows (-1, 0, 1) are real options: with fewer
 * than three roles the ring repeats inside the window, and only the first
 * appearance of each role counts (current first, then the row above).
 */
export function optionOffsets(position: number, count: number): Set<number> {
  const seen = new Set<number>()
  const offsets = new Set<number>()
  for (const offset of [0, -1, 1]) {
    const index = mod(position + offset, count)
    if (seen.has(index)) continue
    seen.add(index)
    offsets.add(offset)
  }
  return offsets
}
