export interface Token {
  text: string
  /** The exact whitespace that followed the token in the source. */
  sep: string
}

// Chip links, the curious toggle and <strong> runs stay atomic; everything else splits on whitespace.
const TOKEN = /<a class="fav"[\s\S]*?<\/a>|<button class="curiosity-trigger"[\s\S]*?<\/button>|<strong>[\s\S]*?<\/strong>|[^\s]+/g

export const splitStrong = (html: string): string =>
  html.replace(/<strong>([^<]*)<\/strong>/g, (_, inner: string) =>
    inner.trim().split(/\s+/).map((w) => `<strong>${w}</strong>`).join(' '))

export function tokenize(raw: string): Token[] {
  const html = splitStrong(raw)
  const out: Token[] = []
  let end = 0
  for (const m of html.matchAll(TOKEN)) {
    const last = out.at(-1)
    if (last) last.sep = html.slice(end, m.index)
    out.push({ text: m[0], sep: '' })
    end = m.index + m[0].length
  }
  return out
}
