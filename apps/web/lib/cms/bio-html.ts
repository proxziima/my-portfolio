import { chipLinkHtml, curiousToggleHtml, escapeHtml } from '@/shared/ui/chip-markup'

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

function inlineBlock(fields: Record<string, unknown> = {}): string {
  switch (fields.blockType) {
    case 'chipLink':
      return chipLinkHtml({ label: str(fields.label), chip: str(fields.chip), href: str(fields.url) || null })
    case 'curiousToggle':
      return curiousToggleHtml(str(fields.word) || 'curious')
    default:
      return ''
  }
}

function node(n: LexicalNode): string {
  switch (n.type) {
    case 'text': {
      const text = escapeHtml(n.text ?? '')
      return (n.format ?? 0) & IS_BOLD ? `<strong>${text}</strong>` : text
    }
    case 'linebreak':
      return ' '
    case 'inlineBlock':
      return inlineBlock(n.fields)
    default:
      return (n.children ?? []).map(node).join('')
  }
}

export function bioParagraphs(value: RichTextValue | null | undefined): string[] {
  return (value?.root.children ?? []).map((p) => (p.children ?? []).map(node).join('').trim()).filter(Boolean)
}
