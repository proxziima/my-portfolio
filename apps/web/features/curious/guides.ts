import type { PageRect } from '@/lib/dom/page-rect'
import type { CuriousNote, PageNotes, Side } from '@/lib/cms/types'

export type GuideKind = 'rail' | 'width' | 'section' | 'gap' | 'note' | 'formula'
export type SectionName = 'bio' | 'figure' | 'work' | 'projects' | 'content'
/** Which edge of a note sits at its `top`: a top note hangs down from it, a bottom note stands up on it. */
export type NoteAnchor = 'top' | 'bottom'

export interface Guide {
  key: string
  kind: GuideKind
  left: number
  top: number
  width?: number
  height?: number
  /** Monospace label for rails, brackets and gaps; the handwritten text for notes. */
  label?: string
  formula?: string
  side?: Side
  anchor?: NoteAnchor
  rotation?: number
  delay: number
}

export interface Measurements {
  main: PageRect
  docHeight: number
  sections: Partial<Record<SectionName, PageRect>>
  gaps: { from: PageRect; to: PageRect }[]
  anchors: Partial<Record<'name' | 'switch' | 'role', PageRect>>
  figure?: PageRect
}

const GUTTER = 16, NOTE_W = 200, NOTE_OFFSET = 52, STAGGER = 35, FORMULA_STEP = 82, MIN_GAP = 20
const SECTION_ORDER: SectionName[] = ['bio', 'figure', 'work', 'projects', 'content']
const LIST_SECTIONS: SectionName[] = ['work', 'projects', 'content']

/**
 * The single source for a note's type metrics: CuriousOverlay passes them to the CSS as custom properties,
 * and the leader maths below uses them. `leader` is where the leader sits in a line, in em.
 */
export const NOTE_METRICS = { fontPx: 20, lineHeight: 1.08, leader: 0.65 } as const
const NOTE_LINE = NOTE_METRICS.fontPx * NOTE_METRICS.lineHeight
const NOTE_LEADER = NOTE_METRICS.fontPx * NOTE_METRICS.leader

/** The `top` that puts a note's leader at `y`: on its first line when top-anchored, on its last when bottom-anchored. */
const topForLeader = (y: number, anchor: NoteAnchor): number =>
  anchor === 'bottom' ? y + NOTE_LINE - NOTE_LEADER : y - NOTE_LEADER

const centreY = (r: PageRect) => r.top + r.height / 2

/**
 * Curious mode's guides, from measured rects (document coordinates), in the reference's order:
 * rails, width bracket, section guides, gap markers, page notes, then the role's formula notes
 * centred beside the figure. Pure: the overlay measures, this decides.
 */
export function computeGuides(m: Measurements, pageNotes: PageNotes, roleNotes: CuriousNote[]): Guide[] {
  const guides: Guide[] = []
  const col = { left: m.main.left + GUTTER, right: m.main.right - GUTTER }
  const colW = col.right - col.left

  const noteLeft = (side: Side) => (side === 'right' ? col.right + NOTE_OFFSET : col.left - NOTE_OFFSET - NOTE_W)
  const push = (g: Omit<Guide, 'key' | 'delay'>) => {
    const i = guides.length
    guides.push({ ...g, key: `${g.kind}-${i}`, delay: i * STAGGER })
  }
  const note = (side: Side, top: number, label: string, rotation: number, fromRole?: CuriousNote) =>
    push({
      kind: fromRole ? 'formula' : 'note',
      side, top, label, rotation,
      left: noteLeft(side),
      ...(fromRole?.formula ? { formula: fromRole.formula } : {}),
    })
  /** A page note whose leader points at page y `y`. */
  const pointAt = (side: Side, y: number, anchor: NoteAnchor, label: string, rotation: number) =>
    push({ kind: 'note', side, anchor, top: topForLeader(y, anchor), label, rotation, left: noteLeft(side) })

  push({ kind: 'rail', left: col.left, top: 0, height: m.docHeight })
  push({ kind: 'rail', left: col.right, top: 0, height: m.docHeight })
  push({ kind: 'width', left: col.left, top: m.main.top + 12, width: colW, label: `${Math.round(colW)}px` })

  for (const section of SECTION_ORDER) {
    const r = m.sections[section]
    if (r) push({ kind: 'section', left: col.left, top: r.top, width: colW, label: section })
  }
  for (const { from, to } of m.gaps) {
    const gap = to.top - from.bottom
    if (gap > MIN_GAP) push({ kind: 'gap', left: col.left - 14, top: from.bottom, height: gap, label: `${Math.round(gap)}px` })
  }

  const { name, switch: sw, role } = m.anchors
  // the two left notes are one line apart: the headline note stands up on the name, the role note hangs from the drum
  if (name) pointAt('left', centreY(name), 'bottom', pageNotes.headline, -1.5)
  note('right', m.main.top + 24, pageNotes.columnWidth.replaceAll('{w}', String(Math.round(colW))), 1)
  if (sw) note('right', sw.bottom + 14, pageNotes.wallSwitch, -0.8)
  if (role) pointAt('left', centreY(role), 'top', pageNotes.role, 1.1)
  // the first list on the page: a role can have no work, or no lists at all
  const firstList = LIST_SECTIONS.map((s) => m.sections[s]).find(Boolean)
  if (firstList) {
    note('right', firstList.top - 42, pageNotes.sectionGap, 1.2)
    note('left', firstList.top + 58, pageNotes.chips, -1)
  }

  if (m.figure) {
    const cy = centreY(m.figure)
    for (const side of ['right', 'left'] as const) {
      const list = roleNotes.filter((n) => n.side === side)
      list.forEach((n, k) => {
        const top = cy - ((list.length - 1) / 2 - k) * FORMULA_STEP - 22
        note(side, top, n.text, (k % 2 ? 1 : -1) * (0.6 + k * 0.3), n)
      })
    }
  }
  return guides
}
