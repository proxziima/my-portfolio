import { randomBytes } from 'crypto'

type Segment = string | { bold: string } | { chip: string; label: string; url?: string } | { curious: string }

export const b = (bold: string): Segment => ({ bold })
export const chip = (label: string, code: string, url?: string): Segment => ({ chip: code, label, url })
export const curious = (word = 'curious'): Segment => ({ curious: word })

const id = () => randomBytes(12).toString('hex')
const text = (value: string, format: 0 | 1) => ({ type: 'text', text: value, format, detail: 0, mode: 'normal', style: '', version: 1 })
const inline = (fields: Record<string, unknown>) => ({ type: 'inlineBlock', version: 1, fields: { id: id(), blockName: '', ...fields } })

function toNode(segment: Segment) {
  if (typeof segment === 'string') return text(segment, 0)
  if ('bold' in segment) return text(segment.bold, 1)
  if ('curious' in segment) return inline({ blockType: 'curiousToggle', word: segment.curious })
  return inline({ blockType: 'chipLink', label: segment.label, chip: segment.chip, url: segment.url ?? null })
}

export function richText(paragraphs: Segment[][]) {
  return {
    root: {
      type: 'root', format: '', indent: 0, version: 1, direction: 'ltr' as const,
      children: paragraphs.map((segments) => ({
        type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr' as const, textFormat: 0, textStyle: '',
        children: segments.map(toNode),
      })),
    },
  }
}
