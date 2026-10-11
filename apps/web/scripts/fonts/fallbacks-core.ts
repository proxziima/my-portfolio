export interface Metrics {
  ascent: number
  descent: number
  lineGap: number
  unitsPerEm: number
  xWidthAvg: number
}

export interface Overrides {
  sizeAdjust: number
  ascentOverride: number
  descentOverride: number
  lineGapOverride: number
}

/**
 * Capsize's fallback maths: make the fallback's average glyph as wide as the web font's, then express
 * the web font's vertical metrics in the scaled fallback's em, so lines are as tall. `correction` is
 * the measured factor that closes the remaining gap on the site's own text (see fallbacks.ts).
 */
export function overrides(web: Metrics, fallback: Metrics, correction: number): Overrides {
  const sizeAdjust = (web.xWidthAvg / web.unitsPerEm / (fallback.xWidthAvg / fallback.unitsPerEm)) * correction
  return {
    sizeAdjust,
    ascentOverride: web.ascent / web.unitsPerEm / sizeAdjust,
    descentOverride: Math.abs(web.descent) / web.unitsPerEm / sizeAdjust,
    lineGapOverride: web.lineGap / web.unitsPerEm / sizeAdjust,
  }
}

/** English letter and space frequencies, the a–z and space entries of Capsize's `latin` weightings (@capsizecss/unpack). */
export const LETTER_WEIGHTS: Readonly<Record<string, number>> = {
  ' ': 0.154, a: 0.0668, b: 0.0114, c: 0.0232, d: 0.0298, e: 0.0922, f: 0.017, g: 0.0155, h: 0.0351,
  i: 0.0588, j: 0.0009, k: 0.0046, l: 0.0304, m: 0.0181, n: 0.0578, o: 0.0571, p: 0.0163, q: 0.0008,
  r: 0.0526, s: 0.0469, t: 0.0672, u: 0.0207, v: 0.0076, w: 0.011, x: 0.0025, y: 0.0123, z: 0.0011,
}

/** Frequency-weighted average advance, in font units: the starting width ratio the measured correction refines. */
export function xWidthAvg(advance: (char: string) => number): number {
  let sum = 0
  let weight = 0
  for (const [char, w] of Object.entries(LETTER_WEIGHTS)) {
    sum += advance(char) * w
    weight += w
  }
  return Math.round(sum / weight)
}

export interface Candidate {
  /** Blocks whose height differs from Inter's, over every role and width: what the gate checks. */
  mismatches: number
  /** Blocks as tall as in Inter whose words still break onto other lines: moved text, so a smaller shift. */
  breaks: number
  /** Worst line-width error. */
  error: number
}

/**
 * Picks among candidates measured on an ascending correction grid. Where some corrections keep every height,
 * the widest such run, and in it the fewest changed line breaks, nearest the middle (the most room for rendering
 * differences either way). Otherwise the fewest height mismatches, then line breaks, then the smallest error.
 */
export function pickCorrection(candidates: readonly Candidate[]): { index: number; window?: [number, number] } {
  let window: [number, number] | undefined
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i]!.mismatches !== 0) continue
    let j = i
    while (j + 1 < candidates.length && candidates[j + 1]!.mismatches === 0) j++
    if (!window || j - i > window[1] - window[0]) window = [i, j]
    i = j
  }
  if (window) {
    const middle = (window[0] + window[1]) / 2
    let index = window[0]
    for (let i = window[0]; i <= window[1]; i++) {
      const c = candidates[i]!
      const b = candidates[index]!
      if (c.breaks < b.breaks || (c.breaks === b.breaks && Math.abs(i - middle) < Math.abs(index - middle))) index = i
    }
    return { index, window }
  }
  let index = 0
  candidates.forEach((c, i) => {
    const b = candidates[index]!
    const better =
      c.mismatches < b.mismatches ||
      (c.mismatches === b.mismatches && (c.breaks < b.breaks || (c.breaks === b.breaks && c.error < b.error)))
    if (better) index = i
  })
  return { index }
}

const CORRECTIONS = /\/\* corrections: (.*?) \*\//

/** The corrections a previous run committed, so a machine without some face keeps that face's measured value. */
export function parseCorrections(css: string): Record<string, number> {
  const line = CORRECTIONS.exec(css)?.[1]
  if (!line) return {}
  return Object.fromEntries(
    line
      .split(' ')
      .map((pair) => pair.split('='))
      .filter((kv): kv is [string, string] => kv.length === 2 && Number.isFinite(Number(kv[1])))
      .map(([k, v]) => [k, Number(v)]),
  )
}

export const formatCorrections = (c: Record<string, number>): string =>
  `/* corrections: ${Object.entries(c)
    .map(([k, v]) => `${k}=${v.toFixed(4)}`)
    .join(' ')} */`

const pct = (n: number) => `${(n * 100).toFixed(4)}%`

/** `local` takes several names because platforms match local() on the full or the PostScript name, not the family. */
export function fallbackFace(family: string, local: string | string[], o: Overrides): string {
  const names = typeof local === 'string' ? [local] : local
  return [
    '@font-face {',
    `  font-family: '${family}';`,
    `  src: ${names.map((n) => `local('${n}')`).join(', ')};`,
    `  size-adjust: ${pct(o.sizeAdjust)};`,
    `  ascent-override: ${pct(o.ascentOverride)};`,
    `  descent-override: ${pct(o.descentOverride)};`,
    `  line-gap-override: ${pct(o.lineGapOverride)};`,
    '}',
  ].join('\n')
}
