import { describe, expect, it } from 'vitest'
import { layout, PAGE, wrap } from '@/scripts/resume-pdf/layout'
import { inline, parseMarkdown, unescape } from '@/scripts/resume-pdf/markdown'
import { textWidth } from '@/scripts/resume-pdf/metrics'
import { pdfString, writePdf10 } from '@/scripts/resume-pdf/pdf10'

const latin1 = (bytes: Uint8Array) => String.fromCharCode(...bytes)

describe('markdown', () => {
  it('undoes Google Docs escapes: en dashes, list dots, plus and tilde, links', () => {
    expect(unescape('Oct 2024 \\-- Present')).toBe('Oct 2024 – Present')
    expect(unescape('Python \\- SQL')).toBe('Python · SQL')
    expect(unescape('\\+55 \\~30%')).toBe('+55 ~30%')
    expect(unescape('[a@b.dev](mailto:a@b.dev)')).toBe('a@b.dev')
  })

  it('splits bold and italic runs', () => {
    expect(inline('**Languages** \\- Python')).toEqual([
      { text: 'Languages', style: 'bold' },
      { text: ' · Python', style: 'regular' },
    ])
    expect(inline('*Dec 2022 \\-- Oct 2024*')).toEqual([{ text: 'Dec 2022 – Oct 2024', style: 'italic' }])
  })

  it('reads headings, hard-broken paragraphs and bullets', () => {
    const blocks = parseMarkdown('# Name\n\nSão Paulo  \n\\+55 1\n\n## SKILLS\n\n### Co\n\n- one  \n- two\\\\\n')
    expect(blocks.map((b) => b.kind)).toEqual(['title', 'paragraph', 'section', 'subsection', 'bullets'])
    expect(blocks[1]).toEqual({ kind: 'paragraph', lines: [[{ text: 'São Paulo', style: 'regular' }], [{ text: '+55 1', style: 'regular' }]] })
    expect(blocks[4]).toEqual({ kind: 'bullets', items: [[{ text: 'one', style: 'regular' }], [{ text: 'two', style: 'regular' }]] })
  })
})

describe('layout', () => {
  it('wraps within the width and keeps font changes as separate segments', () => {
    const runs = inline('**Backend & Systems** \\- REST API Design, Distributed Systems, Microservices, Event-driven architectures, Webhooks')
    const lines = wrap(runs, 300, 11)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      const last = line.at(-1)!
      expect(last.x + textWidth(last.text, last.font, 11)).toBeLessThanOrEqual(300.01)
    }
    expect(lines[0]![0]).toMatchObject({ x: 0, text: 'Backend & Systems', font: 'Helvetica-Bold' })
    expect(lines[0]![1]!.font).toBe('Helvetica')
  })

  it('starts a new page instead of writing below the margin', () => {
    const many = Array.from({ length: 120 }, (_, i) => `- item ${i}`).join('\n')
    const pages = layout(parseMarkdown(many))
    expect(pages.length).toBeGreaterThan(1)
    for (const page of pages) for (const mark of page) expect(mark.y).toBeGreaterThanOrEqual(PAGE.margin - 0.01)
  })
})

describe('pdf 1.0', () => {
  it('escapes parentheses and backslashes, and writes non-ASCII as WinAnsi octal', () => {
    expect(pdfString('a (b) \\c')).toBe('(a \\(b\\) \\\\c)')
    expect(pdfString('São – •')).toBe('(S\\343o \\226 \\225)')
  })

  it('is a version 1.0 file with base fonts only, no compression, and correct xref offsets', () => {
    const file = latin1(writePdf10(layout(parseMarkdown('# Name\n\nHello (world).\n')), 'Name'))
    expect(file.startsWith('%PDF-1.0\n')).toBe(true)
    expect(file).not.toMatch(/FlateDecode|FontFile|ObjStm/)
    expect(file).toContain('/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding')
    const xref = Number(file.match(/startxref\n(\d+)/)![1])
    expect(file.slice(xref, xref + 4)).toBe('xref')
    const offsets = [...file.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    offsets.forEach((offset, i) => expect(file.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true))
  })
})
