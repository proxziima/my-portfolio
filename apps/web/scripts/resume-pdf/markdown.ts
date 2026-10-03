/**
 * The Markdown a Google Docs export produces, reduced to what a résumé uses: `#`/`##`/`###` headings,
 * paragraphs with hard breaks (two trailing spaces or a trailing `\\`), `- ` bullets, `**bold**`,
 * `*italic*` and `[links](url)` (kept as their text). Docs escapes `+ - ~` and writes en dashes as
 * `\--`; a ` \- ` between items becomes a middle dot, since Docs uses it to flatten short lists.
 */
export type Style = 'regular' | 'bold' | 'italic'
export interface Run {
  text: string
  style: Style
}

export type Block =
  | { kind: 'title'; text: string }
  | { kind: 'section'; text: string }
  | { kind: 'subsection'; text: string }
  /** Each entry is one hard-broken line, as runs. */
  | { kind: 'paragraph'; lines: Run[][] }
  | { kind: 'bullets'; items: Run[][] }

/** Docs' escapes, the en dash first so `\--` does not become a hyphen and a dash. */
export function unescape(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/ \\- /g, ' · ')
    .replace(/\\--/g, '–')
    .replace(/\\([-+~#*_[\]()])/g, '$1')
}

/** `**bold**` and `*italic*` into runs (no nesting: résumés don't nest). */
export function inline(text: string): Run[] {
  const runs: Run[] = []
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) runs.push({ text: unescape(text.slice(last, m.index)), style: 'regular' })
    runs.push(m[1] !== undefined ? { text: unescape(m[1]), style: 'bold' } : { text: unescape(m[2] ?? ''), style: 'italic' })
    last = m.index + m[0].length
  }
  if (last < text.length) runs.push({ text: unescape(text.slice(last)), style: 'regular' })
  return runs.filter((r) => r.text.trim() !== '' || r.text === ' ')
}

/** A trailing hard break (two spaces or `\\`) and its whitespace, gone. */
const stripBreak = (line: string) => line.replace(/(\\\\| {2,})\s*$/, '').replace(/\s+$/, '')

export function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = []
  for (const chunk of markdown.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').filter((l) => l.trim() !== '')
    const first = lines[0]
    if (!first) continue
    if (first.startsWith('# ')) blocks.push({ kind: 'title', text: unescape(first.slice(2).trim()) })
    else if (first.startsWith('## ')) blocks.push({ kind: 'section', text: unescape(first.slice(3).trim()) })
    else if (first.startsWith('### ')) blocks.push({ kind: 'subsection', text: unescape(first.slice(4).trim()) })
    else if (lines.every((l) => l.startsWith('- '))) blocks.push({ kind: 'bullets', items: lines.map((l) => inline(stripBreak(l.slice(2)))) })
    else blocks.push({ kind: 'paragraph', lines: lines.map((l) => inline(stripBreak(l))) })
  }
  return blocks
}
