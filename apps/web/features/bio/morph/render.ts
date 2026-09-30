import { lcsKeep } from './lcs'
import { tokenize, type Token } from './tokenize'

const wrap = (tokens: Token[], isKept: (i: number) => boolean, cls: string) =>
  tokens.map((t, i) => `<span class="w${isKept(i) ? '' : ` ${cls}`}">${t.text}</span>${t.sep}`).join('')

const paragraph = (inner: string) => `<p>${inner}</p>`

export const renderParagraphs = (paragraphs: string[]): string =>
  paragraphs.map((p) => paragraph(wrap(tokenize(p), () => true, ''))).join('')

export interface MorphPlan {
  /** Per paragraph: indices of the currently shown words that must fade out. */
  leaving: Set<number>[]
  /** Markup to swap in once they have; new words carry the `in` class. */
  nextHtml: string
}

export function planMorph(prev: string[], next: string[]): MorphPlan {
  const plans = next.map((p, k) => {
    const a = tokenize(prev[k] ?? '')
    const b = tokenize(p)
    return { a, b, ...lcsKeep(a.map((t) => t.text), b.map((t) => t.text)) }
  })
  return {
    leaving: plans.map(({ a, keepA }) => new Set(a.map((_, i) => i).filter((i) => !keepA.has(i)))),
    nextHtml: plans.map(({ b, keepB }) => paragraph(wrap(b, (i) => keepB.has(i), 'in'))).join(''),
  }
}
