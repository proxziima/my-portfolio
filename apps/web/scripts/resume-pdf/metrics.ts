/**
 * Character widths of the PostScript base fonts the 1993 Acrobat Reader for DOS has built in, in
 * 1/1000 em (Adobe's AFM files). Oblique shares Regular's widths. Enough to wrap lines exactly;
 * no font is embedded, so the PDF stays version 1.0.
 */
export type FontName = 'Helvetica' | 'Helvetica-Bold' | 'Helvetica-Oblique'

// printable ASCII, 32 (space) .. 126 (~)
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
  611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]

/** The few non-ASCII glyphs the résumé uses, by font weight. */
const EXTRA: Record<string, [regular: number, bold: number]> = {
  '–': [556, 556], // en dash
  '•': [350, 350],
  '·': [278, 278],
}

const table = (font: FontName) => (font === 'Helvetica-Bold' ? BOLD : REGULAR)

/** Width of one character; accented letters take their base letter's width (é → e), as in the AFM. */
export function charWidth(char: string, font: FontName): number {
  const extra = EXTRA[char]
  if (extra) return font === 'Helvetica-Bold' ? extra[1] : extra[0]
  const base = char.normalize('NFD')[0] ?? char
  const code = base.charCodeAt(0)
  const widths = table(font)
  return code >= 32 && code <= 126 ? (widths[code - 32] ?? 556) : 556
}

/** Width of a string at `size` points. */
export const textWidth = (text: string, font: FontName, size: number): number =>
  ([...text].reduce((sum, char) => sum + charWidth(char, font), 0) * size) / 1000
