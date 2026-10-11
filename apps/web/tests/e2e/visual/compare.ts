import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

export interface Diff {
  ratio: number
  /** Largest 4-connected cluster of differing pixels, in px². */
  largestCluster: number
}

/** Pixel diff with anti-aliasing ignored; also the biggest connected blob, so a thin sliver at an edge is caught. */
export function comparePng(actualPath: string, baselinePath: string, diffPath: string): Diff {
  const a = PNG.sync.read(readFileSync(actualPath))
  const b = PNG.sync.read(readFileSync(baselinePath))
  if (a.width !== b.width || a.height !== b.height) throw new Error(`size ${a.width}×${a.height} vs ${b.width}×${b.height}`)
  const out = new PNG({ width: a.width, height: a.height })
  const count = pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold: 0.1, includeAA: false })
  mkdirSync(dirname(diffPath), { recursive: true })
  writeFileSync(diffPath, PNG.sync.write(out))
  return { ratio: count / (a.width * a.height), largestCluster: largestCluster(out) }
}

/** pixelmatch paints differing pixels pure red (255,0,0). */
function largestCluster(png: PNG): number {
  const { width, height, data } = png
  const seen = new Uint8Array(width * height)
  const isDiff = (i: number) => data[i * 4] === 255 && data[i * 4 + 1] === 0 && data[i * 4 + 2] === 0
  let best = 0
  const stack: number[] = []
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !isDiff(start)) continue
    let size = 0
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const i = stack.pop()!
      size++
      const x = i % width
      for (const j of [i - 1, i + 1, i - width, i + width]) {
        if (j < 0 || j >= width * height || seen[j] || !isDiff(j)) continue
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === width - 1)) continue
        seen[j] = 1
        stack.push(j)
      }
    }
    best = Math.max(best, size)
  }
  return best
}

export const hasBaseline = (path: string) => existsSync(path)
