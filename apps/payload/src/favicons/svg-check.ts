/**
 * A cheap first filter on SVG markup, run before any parser sees it. The guarantee against a hostile
 * SVG is the sandboxed render (render.ts); this refuses the known-expensive or nested-document shapes
 * up front, so they cost no process at all.
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
const asUrl = (value: string) => value.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '').replace(/[\t\n\r]/g, '')

/** Raw values of every `href` and `src` attribute, any namespace prefix, in elements and processing instructions. */
const urlAttributes = (markup: string) =>
  [...markup.matchAll(/\s(?:[\w.-]+:)?(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => decodeXml(m[1] ?? m[2]!))

/**
 * `#id`s of linear and radial gradients, when nothing else in the markup carries the same id (a
 * duplicate could make a reference that looks like a gradient's land on a mask or pattern instead).
 * An attribute value cannot contain `<`, so the last `<` before an id attribute opens its element.
 */
function gradientIds(markup: string): Set<string> {
  const counts = new Map<string, number>()
  const gradients: string[] = []
  for (const m of markup.matchAll(/\s(?:[\w.-]+:)?id\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const id = `#${decodeXml(m[1] ?? m[2]!)}`
    counts.set(id, (counts.get(id) ?? 0) + 1)
    const tag = markup.slice(markup.lastIndexOf('<', m.index), m.index)
    if (/^<(?:[\w.-]+:)?(?:linear|radial)Gradient(?:\s|$)/.test(tag)) gradients.push(id)
  }
  return new Set(gradients.filter((id) => counts.get(id) === 1))
}

/** `#id` references in a piece of markup: CSS `url(#…)` (after XML and CSS decoding) and `href`/`src` values. */
const references = (text: string) => [
  ...[...decodeCss(decodeXml(text)).matchAll(/url\(\s*['"]?\s*(#[^'")\s]*)/gi)].map((m) => m[1]!),
  ...urlAttributes(text).map(asUrl).filter((url) => url.startsWith('#')),
]

/** Elements whose content is drawn wherever they are referenced, so references inside them multiply. */
const CONTAINERS = new Set(['mask', 'pattern', 'clipPath', 'marker', 'filter', 'symbol'])

/**
 * Markup tokens, leftmost first: comments, CDATA sections, processing instructions and the DOCTYPE
 * (each opaque, so markup-like text inside them is not mistaken for tags), then end and start tags
 * (attribute values may hold `>` but never `<`). Anything between tokens is text.
 */
const TOKENS =
  /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<\?[\s\S]*?(?:\?>|$)|<!DOCTYPE[^[>]*(?:\[[\s\S]*?\])?\s*>|<\/([^\s>]+)\s*>|<([A-Za-z_:\x80-\xff][^\s/>]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)(\/?)>/g

/**
 * The `#id` references that can multiply what is drawn: those made inside a container (CONTAINERS, or
 * any element a `href` points at, as `<use>` and `<feImage>` do), whose content is drawn once per
 * reference to it; and every reference in a stylesheet or other text, whose rules can apply inside any
 * container. A plain reference from the drawing itself (a path's clip-path, a top-level `<use>`) only
 * draws its target once, so it costs nothing here.
 */
function chainedReferences(markup: string): string[] {
  const hrefTargets = new Set(urlAttributes(markup).map(asUrl).filter((url) => url.startsWith('#')))
  const open: { name: string; inside: boolean }[] = []
  const found: string[] = []
  let textStart = 0
  for (const token of markup.matchAll(TOKENS)) {
    found.push(...references(markup.slice(textStart, token.index)))
    textStart = token.index + token[0].length
    const [whole, endName, startName, attributes, selfClosing] = token
    if (endName !== undefined) {
      const at = open.map((element) => element.name).lastIndexOf(endName)
      if (at >= 0) open.length = at
    } else if (startName !== undefined) {
      const ids = [...attributes!.matchAll(/\s(?:[\w.-]+:)?id\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => `#${decodeXml(m[1] ?? m[2]!)}`)
      const inside =
        (open.at(-1)?.inside ?? false) || CONTAINERS.has(startName.replace(/^[^:]*:/, '')) || ids.some((id) => hrefTargets.has(id))
      if (inside) found.push(...references(whole))
      if (!selfClosing) open.push({ name: startName, inside })
    } else {
      found.push(...references(whole))
    }
  }
  found.push(...references(markup.slice(textStart)))
  return found
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
 */
export function isBoundedSvg(data: Buffer): boolean {
  if (data.includes(0)) return false
  const markup = data.toString('latin1')
  const encoding = /^(?:\xef\xbb\xbf)?<\?xml[^>]*?\bencoding\s*=\s*["']([^"']*)/.exec(markup)?.[1]
  if (encoding !== undefined && !/^(?:utf-?8|(?:us-)?ascii|iso-8859-\d+|latin-?1)$/i.test(encoding)) return false
  if (/<!(?:ENTITY|ATTLIST|ELEMENT|NOTATION)/i.test(markup)) return false

  const decoded = decodeCss(decodeXml(markup))
  const asUrls = decoded.replace(/[\t\n\r]/g, '')
  if (/xinclude|@import/i.test(asUrls)) return false
  const inlineData = [...asUrls.matchAll(/data:/gi)]
  if (inlineData.length > MAX_INLINE_IMAGES) return false
  for (const { index } of inlineData) {
    INLINE_IMAGE.lastIndex = index
    if (!INLINE_IMAGE.test(asUrls)) return false
  }

  const cssRefs = [...decoded.matchAll(/url\(\s*(['"]?)\s*([^'")\s]*)/gi)].map((m) => m[2]!)
  const attrRefs = urlAttributes(markup).map(asUrl)
  if (!cssRefs.every((url) => url.startsWith('#'))) return false
  if (!attrRefs.every((url) => url.startsWith('#') || INLINE_IMAGE_VALUE.test(url))) return false

  const gradients = gradientIds(markup)
  const refs = chainedReferences(markup).filter((url) => !gradients.has(url)).length
  const elements = count(markup, /<[A-Za-z_:\x80-\xff]/g)
  return elements <= MAX_ELEMENTS && elements * 3 ** (refs / 3) <= MAX_INSTANCES
}
