import { chipLinkHtml, curiousToggleHtml, escapeHtml } from '@/shared/ui/chip-markup'
import { findRecord, type Records } from './records'

interface LexicalNode {
  type: string
  text?: string
  format?: number
  children?: LexicalNode[]
  fields?: Record<string, unknown>
}
export interface RichTextValue { root: { children: LexicalNode[] } }

const IS_BOLD = 1
const str = (value: unknown) => (typeof value === 'string' ? value : '')

function inlineBlock(records: Records, fields: Record<string, unknown> = {}): string {
  switch (fields.blockType) {
    case 'chipLink':
      return chipLinkHtml({ label: str(fields.label), chip: str(fields.chip), href: str(fields.url) || null })
    case 'recordLink': {
      const ref = (fields.record ?? {}) as { relationTo?: unknown; value?: unknown }
      const brand = typeof ref.relationTo === 'string' ? findRecord(records, ref.relationTo, ref.value) : undefined
      // A record the site cannot read (not public, or deleted) leaves no link behind.
      return brand ? chipLinkHtml(brand) : ''
    }
    case 'curiousToggle':
      return curiousToggleHtml(str(fields.word) || 'curious')
    default:
      return ''
  }
}

function node(n: LexicalNode, records: Records): string {
  switch (n.type) {
    case 'text': {
      const text = escapeHtml(n.text ?? '')
      return (n.format ?? 0) & IS_BOLD ? `<strong>${text}</strong>` : text
    }
    case 'linebreak':
      return ' '
    case 'inlineBlock':
      return inlineBlock(records, n.fields)
    default:
      return (n.children ?? []).map((c) => node(c, records)).join('')
  }
}

export function bioParagraphs(value: RichTextValue | null | undefined, records: Records): string[] {
  return (value?.root.children ?? []).map((p) => (p.children ?? []).map((c) => node(c, records)).join('').trim()).filter(Boolean)
}
