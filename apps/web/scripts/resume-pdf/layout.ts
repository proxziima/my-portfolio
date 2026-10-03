import type { Block, Run, Style } from './markdown'
import { textWidth, type FontName } from './metrics'

/** One piece of text at a position, in points from the page's bottom-left (PDF's own frame). */
export interface Glyphs {
  kind: 'text'
  x: number
  y: number
  text: string
  font: FontName
  size: number
}
export interface Rule {
  kind: 'rule'
  x1: number
  x2: number
  y: number
}
export type Mark = Glyphs | Rule
export type Page = Mark[]

/** A4, with sizes chosen for the Reader's 640×480 screen at 100 %: 11 pt body reads there. */
export const PAGE = { width: 595, height: 842, margin: 54 }
const SIZE = { title: 22, section: 12, subsection: 12, body: 11 }
const LEADING = 1.32
const BULLET_INDENT = 16

const fontOf = (style: Style): FontName => (style === 'bold' ? 'Helvetica-Bold' : style === 'italic' ? 'Helvetica-Oblique' : 'Helvetica')

interface Word {
  text: string
  font: FontName
  /** A space precedes this word on its line. */
  space: boolean
}

/** Runs into words, remembering which ones had a space before them (`**Label** \- x` keeps its space). */
function words(runs: Run[]): Word[] {
  const out: Word[] = []
  let pendingSpace = false
  for (const run of runs) {
    const parts = run.text.split(/(\s+)/)
    for (const part of parts) {
      if (part === '') continue
      if (/^\s+$/.test(part)) {
        pendingSpace = true
        continue
      }
      out.push({ text: part, font: fontOf(run.style), space: pendingSpace && out.length > 0 })
      pendingSpace = false
    }
  }
  return out
}

/** Greedy wrap at `width`; each line is a list of same-font segments with their x offset. */
export function wrap(runs: Run[], width: number, size: number): { x: number; text: string; font: FontName }[][] {
  const lines: { x: number; text: string; font: FontName }[][] = []
  let line: { x: number; text: string; font: FontName }[] = []
  let x = 0
  for (const word of words(runs)) {
    const gap = word.space ? textWidth(' ', word.font, size) : 0
    const w = textWidth(word.text, word.font, size)
    if (line.length > 0 && x + gap + w > width) {
      lines.push(line)
      line = []
      x = 0
    }
    const lead = line.length > 0 ? gap : 0
    const prev = line.at(-1)
    // extend the previous segment when the font is unchanged, so the PDF draws whole phrases
    if (prev && prev.font === word.font) prev.text += (lead ? ' ' : '') + word.text
    else line.push({ x: x + lead, text: word.text, font: word.font })
    x += lead + w
  }
  if (line.length > 0) lines.push(line)
  return lines
}

/** Lays the blocks out top to bottom, breaking onto a new page when the next line would not fit. */
export function layout(blocks: Block[]): Page[] {
  const pages: Page[] = [[]]
  const left = PAGE.margin
  const right = PAGE.width - PAGE.margin
  const bottom = PAGE.margin
  let y = PAGE.height - PAGE.margin

  const page = () => pages[pages.length - 1]!
  const ensure = (height: number) => {
    if (y - height >= bottom) return
    pages.push([])
    y = PAGE.height - PAGE.margin
  }
  const text = (x: number, s: string, font: FontName, size: number) => page().push({ kind: 'text', x, y, text: s, font, size })
  const lineHeight = (size: number) => size * LEADING

  for (const block of blocks) {
    switch (block.kind) {
      case 'title': {
        ensure(lineHeight(SIZE.title))
        y -= SIZE.title
        text(left, block.text, 'Helvetica-Bold', SIZE.title)
        y -= SIZE.title * 0.45
        break
      }
      case 'section': {
        y -= SIZE.section * 0.9
        ensure(lineHeight(SIZE.section) + 4)
        y -= SIZE.section
        text(left, block.text, 'Helvetica-Bold', SIZE.section)
        y -= 4
        page().push({ kind: 'rule', x1: left, x2: right, y })
        y -= SIZE.body * 0.6
        break
      }
      case 'subsection': {
        y -= SIZE.subsection * 0.5
        ensure(lineHeight(SIZE.subsection))
        y -= SIZE.subsection
        text(left, block.text, 'Helvetica-Bold', SIZE.subsection)
        y -= SIZE.subsection * 0.35
        break
      }
      case 'paragraph': {
        for (const hard of block.lines) {
          for (const segs of wrap(hard, right - left, SIZE.body)) {
            ensure(lineHeight(SIZE.body))
            y -= lineHeight(SIZE.body)
            for (const s of segs) text(left + s.x, s.text, s.font, SIZE.body)
          }
        }
        y -= SIZE.body * 0.55
        break
      }
      case 'bullets': {
        for (const item of block.items) {
          wrap(item, right - left - BULLET_INDENT, SIZE.body).forEach((segs, i) => {
            ensure(lineHeight(SIZE.body))
            y -= lineHeight(SIZE.body)
            if (i === 0) text(left + 4, '•', 'Helvetica', SIZE.body)
            for (const s of segs) text(left + BULLET_INDENT + s.x, s.text, s.font, SIZE.body)
          })
          y -= SIZE.body * 0.2
        }
        y -= SIZE.body * 0.4
        break
      }
    }
  }
  return pages
}
