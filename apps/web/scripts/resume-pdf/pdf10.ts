import type { Page } from './layout'
import { PAGE } from './layout'
import type { FontName } from './metrics'

/**
 * A PDF 1.0 writer for laid-out pages: the dialect the 1993 Acrobat Reader for DOS reads. Only base
 * fonts by name (nothing embedded), WinAnsi encoding, uncompressed content streams (Flate is PDF 1.2),
 * and a classic cross-reference table. Text stays text: crisp at any zoom and selectable.
 */
const FONTS: FontName[] = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique']
const fontKey = (font: FontName) => `F${FONTS.indexOf(font) + 1}`

/** WinAnsi codes for the few characters outside Latin-1's shared range. */
const WIN_ANSI: Record<string, number> = { '–': 0x96, '—': 0x97, '•': 0x95, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94 }

/** A PDF string literal in WinAnsi, ASCII-only on disk: parentheses and backslash escaped, the rest as octal. */
export function pdfString(text: string): string {
  let out = '('
  for (const char of text) {
    const code = WIN_ANSI[char] ?? char.charCodeAt(0)
    if (char === '(' || char === ')' || char === '\\') out += '\\' + char
    else if (code >= 32 && code < 127) out += char
    else if (code <= 255) out += '\\' + code.toString(8).padStart(3, '0')
    else out += '?' // not in WinAnsi: résumé text never needs it
  }
  return out + ')'
}

const num = (n: number) => (Math.round(n * 100) / 100).toString()

function contentStream(page: Page): string {
  const ops: string[] = ['0 g', '0 G', '0.6 w']
  for (const mark of page) {
    if (mark.kind === 'rule') ops.push(`${num(mark.x1)} ${num(mark.y)} m ${num(mark.x2)} ${num(mark.y)} l S`)
    else ops.push(`BT /${fontKey(mark.font)} ${num(mark.size)} Tf ${num(mark.x)} ${num(mark.y)} Td ${pdfString(mark.text)} Tj ET`)
  }
  return ops.join('\n')
}

/** The whole file, as Latin-1 bytes (everything written is 7-bit ASCII). */
export function writePdf10(pages: Page[], title: string): Uint8Array<ArrayBuffer> {
  const objects: string[] = []
  const add = (body: string) => objects.push(body) // object number = index + 1

  // 1 catalog, 2 pages, 3..5 fonts, 6 info, then a content + page object per page
  add('<< /Type /Catalog /Pages 2 0 R >>')
  const firstPage = 7
  const kids = pages.map((_, i) => `${firstPage + i * 2 + 1} 0 R`).join(' ')
  add(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)
  for (const font of FONTS) add(`<< /Type /Font /Subtype /Type1 /Name /${fontKey(font)} /BaseFont /${font} /Encoding /WinAnsiEncoding >>`)
  add(`<< /Title ${pdfString(title)} /Creator (my-portfolio resume-pdf) >>`)
  const fontRes = FONTS.map((f, i) => `/${fontKey(f)} ${3 + i} 0 R`).join(' ')
  pages.forEach((page, i) => {
    const stream = contentStream(page)
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
        `/Resources << /Font << ${fontRes} >> /ProcSet [/PDF /Text] >> /Contents ${firstPage + i * 2} 0 R >>`,
    )
  })

  let file = '%PDF-1.0\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(file.length)
    file += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = file.length
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) file += `${offset.toString().padStart(10, '0')} 00000 n \n`
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Uint8Array.from(file, (c) => c.charCodeAt(0))
}
