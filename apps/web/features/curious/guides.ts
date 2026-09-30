import type { PageRect } from '@/lib/dom/page-rect'
import type { CuriousNote, PageNotes, Side } from '@/lib/cms/types'

export type GuideKind = 'rail' | 'width' | 'section' | 'gap' | 'note' | 'formula'
export type SectionName = 'bio' | 'figure' | 'work' | 'projects' | 'content'

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
  rotation?: number
  delay: number
}

export interface Measurements {
  main: PageRect
  docHeight: number
  sections: Partial<Record<SectionName, PageRect>>
  gaps: { from: PageRect; to: PageRect }[]
  anchors: Partial<Record<'headline' | 'switch' | 'role', PageRect>>
  figure?: PageRect
}

const GUTTER = 16, NOTE_W = 200, NOTE_OFFSET = 52, STAGGER = 35, FORMULA_STEP = 82, MIN_GAP = 20
const SECTION_ORDER: SectionName[] = ['bio', 'figure', 'work', 'projects', 'content']

/**
 * Curious mode's guides, from measured rects (document coordinates), in the reference's order:
 * rails, width bracket, section guides, gap markers, page notes, then the role's formula notes
 * centred beside the figure. Pure: the overlay measures, this decides.
 */
export function computeGuides(m: Measurements, pageNotes: PageNotes, roleNotes: CuriousNote[]): Guide[] {
  const guides: Guide[] = []
  const col = { left: m.main.left + GUTTER, right: m.main.right - GUTTER }
  const colW = col.right - col.left

  const push = (g: Omit<Guide, 'key' | 'delay'>) => {
    const i = guides.length
    guides.push({ ...g, key: `${g.kind}-${i}`, delay: i * STAGGER })
  }
  const note = (side: Side, top: number, label: string, rotation: number, fromRole?: CuriousNote) =>
    push({
      kind: fromRole ? 'formula' : 'note',
      side, top, label, rotation,
      left: side === 'right' ? col.right + NOTE_OFFSET : col.left - NOTE_OFFSET - NOTE_W,
      ...(fromRole?.formula ? { formula: fromRole.formula } : {}),
    })

  push({ kind: 'rail', left: col.left, top: 0, height: m.docHeight })
  push({ kind: 'rail', left: col.right, top: 0, height: m.docHeight })
  push({ kind: 'width', left: col.left, top: m.main.top + 12, width: colW, label: `${Math.round(colW)}px` })

  for (const name of SECTION_ORDER) {
    const r = m.sections[name]
    if (r) push({ kind: 'section', left: col.left, top: r.top, width: colW, label: name })
  }
  for (const { from, to } of m.gaps) {
    const gap = to.top - from.bottom
    if (gap > MIN_GAP) push({ kind: 'gap', left: col.left - 14, top: from.bottom, height: gap, label: `${Math.round(gap)}px` })
  }

  const { headline, switch: sw, role } = m.anchors
  if (headline) note('left', headline.top + 10, pageNotes.headline, -1.5)
  note('right', m.main.top + 24, pageNotes.columnWidth.replaceAll('{w}', String(Math.round(colW))), 1)
  if (sw) note('right', sw.bottom + 14, pageNotes.wallSwitch, -0.8)
  if (role) note('left', role.top + 118, pageNotes.role, 1.1)
  const work = m.sections.work
  if (work) {
    note('right', work.top - 42, pageNotes.sectionGap, 1.2)
    note('left', work.top + 58, pageNotes.chips, -1)
  }

  if (m.figure) {
    const cy = m.figure.top + m.figure.height / 2
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
