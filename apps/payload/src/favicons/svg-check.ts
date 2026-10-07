/**
 * A cheap first filter on SVG markup, run before any parser sees it. The guarantee against a hostile
 * SVG is the sandboxed render (render.ts); this refuses the known-expensive or nested-document shapes
 * up front, so they cost no process at all.
 *
 * It runs in the CMS process, so everything here is linear in the input: markup is walked by one
 * forward scanner (tokenize), and the remaining regexes have no ambiguous adjacent quantifiers and no
 * class that can run past the next `<` or closing quote and be rescanned.
 */

const MAX_ELEMENTS = 5000
/** Worst-case elements an SVG may instantiate through nested references; see isBoundedSvg. */
const MAX_INSTANCES = 100_000
const MAX_INLINE_IMAGES = 10

/** A `data:` URL an SVG may carry: a base64 PNG, JPEG, GIF or WebP, nothing a parser would descend into. */
const INLINE_IMAGE = /data:image\/(?:png|jpeg|gif|webp);base64,/iy
const INLINE_IMAGE_VALUE = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]*$/i

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0
const codePoint = (n: number) => (n <= 0x10ffff ? String.fromCodePoint(n) : '�')

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** Character and predefined entity references decoded in one pass, as libxml2 does in attribute values and text. */
const decodeXml = (text: string) =>
  text.replace(/&(?:#x([0-9a-f]+)|#([0-9]+)|(amp|lt|gt|quot|apos));?/gi, (ref, hex?: string, dec?: string, name?: string) =>
    name ? (XML_ENTITIES[name.toLowerCase()] ?? ref) : codePoint(hex ? Number.parseInt(hex, 16) : Number(dec)),
  )

/**
 * CSS escapes decoded as a CSS tokenizer reads them: an escaped newline (`\` + LF, CRLF, CR or FF) is a
 * line continuation and vanishes; `\` + up to six hex digits (and one optional whitespace) is that code
 * point; `\` + any other character is the character. Comments are left in place: they only separate
 * tokens, never join them, so keeping them cannot hide a `url(`, `@import` or `data:`.
 */
const decodeCss = (text: string) =>
  text.replace(/\\(?:(\r\n|[\n\r\f])|([0-9a-f]{1,6})(?:\r\n|[ \t\n\r\f])?|([^]))/gi, (_, newline?: string, hex?: string, char?: string) =>
    newline ? '' : hex ? codePoint(Number.parseInt(hex, 16)) : char!,
  )

/** A URL as the URL parser reads it: leading and trailing C0 controls and spaces trimmed, tabs and newlines dropped. */
function asUrl(value: string): string {
  let start = 0
  let end = value.length
  while (start < end && value.charCodeAt(start) <= 0x20) start++
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end--
  return value.slice(start, end).replace(/[\t\n\r]/g, '')
}

/**
 * Values (XML-decoded) of every `name` attribute (`href`/`src`, or `id`), any namespace prefix, in
 * elements and processing instructions. A value never holds `<`, so no scan runs past the next one.
 */
const attributeValues = (markup: string, name: 'href|src' | 'id') =>
  [...markup.matchAll(new RegExp(`\\s(?:[\\w.-]+:)?(?:${name})\\s*=\\s*(?:"([^"<]*)"|'([^'<]*)')`, 'gi'))].map((m) =>
    decodeXml(m[1] ?? m[2]!),
  )

/** `#id` references in a piece of markup: CSS `url(#…)` (after XML and CSS decoding) and `href`/`src` values. */
const references = (text: string) => [
  ...[...decodeCss(decodeXml(text)).matchAll(/url\(\s*(?:['"]\s*)?(#[^'")\s]*)/gi)].map((m) => m[1]!),
  ...attributeValues(text, 'href|src').map(asUrl).filter((url) => url.startsWith('#')),
]

/** Elements whose content is drawn wherever they are referenced, so references inside them multiply. */
const CONTAINERS = new Set(['mask', 'pattern', 'clipPath', 'marker', 'filter', 'symbol'])
const GRADIENTS = new Set(['linearGradient', 'radialGradient'])

type Token =
  /** Text between tags, comments, CDATA sections, processing instructions and DOCTYPEs. */
  | { kind: 'text'; text: string }
  | { kind: 'start'; name: string; text: string; selfClosing: boolean }
  | { kind: 'end'; name: string }

const isNameStart = (code: number) =>
  (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || code === 0x5f || code === 0x3a || code >= 0x80

/**
 * The markup as tokens, in one forward pass: every search either finds its terminator, and the scan
 * moves past it, or runs to the end of the input, which ends the scan. Comments, CDATA sections,
 * processing instructions and DOCTYPEs (internal subset included) are opaque text, so markup-like
 * text inside them is not mistaken for tags; a tag ends at the first `>` outside a quoted value. A `<`
 * that opens nothing stays part of the surrounding text.
 */
function* tokenize(markup: string): Generator<Token> {
  const length = markup.length
  const past = (terminator: string, from: number) => {
    const at = markup.indexOf(terminator, from)
    return at < 0 ? length : at + terminator.length
  }
  let textStart = 0
  let at = 0
  while (at < length) {
    const open = markup.indexOf('<', at)
    if (open < 0) break
    let end: number
    let token: Token | null = null
    if (markup.startsWith('<!--', open)) end = past('-->', open + 4)
    else if (markup.startsWith('<![CDATA[', open)) end = past(']]>', open + 9)
    else if (markup.startsWith('<?', open)) end = past('?>', open + 2)
    else if (markup.startsWith('<!', open)) {
      // A DOCTYPE: it ends at its first `>` outside a quoted literal, unless a `[` (also outside one)
      // opens an internal subset first, which may hold `>` and runs to `]`, then `>`.
      end = length
      for (let i = open + 2; i < length; i++) {
        const code = markup.charCodeAt(i)
        if (code === 0x3e) {
          end = i + 1
          break
        }
        if (code === 0x5b) {
          end = past('>', past(']', i + 1))
          break
        }
        if (code === 0x22 || code === 0x27) {
          const quote = markup.indexOf(markup[i]!, i + 1)
          if (quote < 0) break
          i = quote
        }
      }
    } else if (markup.startsWith('</', open)) {
      end = past('>', open + 2)
      token = { kind: 'end', name: markup.slice(open + 2, end - 1).trim() }
    } else if (isNameStart(markup.charCodeAt(open + 1))) {
      end = length
      for (let i = open + 1; i < length; i++) {
        const code = markup.charCodeAt(i)
        if (code === 0x3e) {
          end = i + 1
          break
        }
        if (code === 0x22 || code === 0x27) {
          const quote = markup.indexOf(markup[i]!, i + 1)
          if (quote < 0) break
          i = quote
        }
      }
      const text = markup.slice(open, end)
      token = { kind: 'start', name: /^<([^\s/>]*)/.exec(text)![1]!, text, selfClosing: text.endsWith('/>') }
    } else {
      at = open + 1
      continue
    }
    if (open > textStart) yield { kind: 'text', text: markup.slice(textStart, open) }
    yield token ?? { kind: 'text', text: markup.slice(open, end) }
    textStart = at = end
  }
  if (textStart < length) yield { kind: 'text', text: markup.slice(textStart) }
}

/**
 * The `#id` references that can multiply what is drawn, minus those to gradients (a gradient only
 * paints): references made inside a container (CONTAINERS, or any element a `href` points at, as
 * `<use>` and `<feImage>` do), whose content is drawn once per reference to it; and every reference in
 * a stylesheet or other text, whose rules can apply inside any container. A plain reference from the
 * drawing itself (a path's clip-path, a top-level `<use>`) only draws its target once, so it costs
 * nothing here. A gradient's id is exempt only when no other element carries it: a duplicate could
 * make a reference that looks like a gradient's land on a mask or pattern instead.
 */
function chainedReferences(markup: string): number {
  const hrefTargets = new Set(attributeValues(markup, 'href|src').map(asUrl).filter((url) => url.startsWith('#')))
  const open: { name: string; inside: boolean }[] = []
  const openNames = new Map<string, number>()
  // Ids are counted over the whole markup, opaque regions included: one the tokenizer reads as a
  // comment or DTD subset still makes a gradient's id a duplicate (erring towards counting the reference).
  const idCounts = new Map<string, number>()
  for (const id of attributeValues(markup, 'id')) idCounts.set(`#${id}`, (idCounts.get(`#${id}`) ?? 0) + 1)
  const gradients: string[] = []
  const counted: string[] = []
  for (const token of tokenize(markup)) {
    if (token.kind === 'text') {
      counted.push(token.text)
    } else if (token.kind === 'end') {
      if (!openNames.get(token.name)) continue
      for (let element = open.pop(); element; element = open.pop()) {
        openNames.set(element.name, openNames.get(element.name)! - 1)
        if (element.name === token.name) break
      }
    } else {
      const ids = attributeValues(token.text, 'id').map((id) => `#${id}`)
      const local = token.name.slice(token.name.indexOf(':') + 1)
      if (GRADIENTS.has(local)) gradients.push(...ids)
      const inside = (open.at(-1)?.inside ?? false) || CONTAINERS.has(local) || ids.some((id) => hrefTargets.has(id))
      if (inside) counted.push(token.text)
      if (!token.selfClosing) {
        open.push({ name: token.name, inside })
        openNames.set(token.name, (openNames.get(token.name) ?? 0) + 1)
      }
    }
  }
  const exempt = new Set(gradients.filter((id) => idCounts.get(id) === 1))
  // Joined with `<`, which no reference or attribute value can span.
  return references(counted.join('<')).filter((url) => !exempt.has(url)).length
}

/**
 * Whether the SVG markup passes the pre-check:
 * - readable as ASCII-compatible text, so the checks below see its markup: no NUL bytes (UTF-16/32)
 *   and no declared encoding other than UTF-8, ASCII or ISO-8859-x;
 * - no DTD declarations (entities, default attributes), no XInclude;
 * - URLs only point inside the document or at an inline raster image: every `href`/`src` is `#id` or a
 *   base64 PNG, JPEG, GIF or WebP `data:` URL, every CSS `url(…)` is `url(#id)`, there is no
 *   `@import`, and every `data:` anywhere (after XML and CSS decoding) is such an image, at most
 *   MAX_INLINE_IMAGES of them; so no nested document (SVG, stylesheet, gzip or not) is ever loaded;
 * - at most MAX_ELEMENTS elements and MAX_INSTANCES worst-case instances: with `refs` chained
 *   references (see chainedReferences), nesting multiplies copies by at most 3^(refs/3). References
 *   to gradients are not counted: a gradient only paints.
 * This is a filter, not the bound: a stylesheet rule applying one reference to many elements, or
 * expensive filters, are left to the render process's time and memory caps (render.ts).
 *
 * Cheapest checks first: bytes and encoding, DTD declarations, the element count, then URLs, then
 * the reference analysis.
 */
export function isBoundedSvg(data: Buffer): boolean {
  if (data.includes(0)) return false
  const markup = data.toString('latin1')
  const prolog = /^(?:\xef\xbb\xbf)?<\?xml[^<>]*/.exec(markup)?.[0] ?? ''
  const encoding = /\sencoding\s*=\s*["']([^"'<>]*)/.exec(prolog)?.[1]
  if (encoding !== undefined && !/^(?:utf-?8|(?:us-)?ascii|iso-8859-\d+|latin-?1)$/i.test(encoding)) return false
  if (/<!(?:ENTITY|ATTLIST|ELEMENT|NOTATION)/i.test(markup)) return false
  const elements = count(markup, /<[A-Za-z_:\x80-\xff]/g)
  if (elements > MAX_ELEMENTS) return false

  const decoded = decodeCss(decodeXml(markup))
  const asUrls = decoded.replace(/[\t\n\r]/g, '')
  if (/xinclude|@import/i.test(asUrls)) return false
  const inlineData = [...asUrls.matchAll(/data:/gi)]
  if (inlineData.length > MAX_INLINE_IMAGES) return false
  for (const { index } of inlineData) {
    INLINE_IMAGE.lastIndex = index
    if (!INLINE_IMAGE.test(asUrls)) return false
  }

  const cssRefs = [...decoded.matchAll(/url\(\s*(?:['"]\s*)?([^'")\s]*)/gi)].map((m) => m[1]!)
  if (!cssRefs.every((url) => url.startsWith('#'))) return false
  const attrRefs = attributeValues(markup, 'href|src').map(asUrl)
  if (!attrRefs.every((url) => url.startsWith('#') || INLINE_IMAGE_VALUE.test(url))) return false

  return elements * 3 ** (chainedReferences(markup) / 3) <= MAX_INSTANCES
}
