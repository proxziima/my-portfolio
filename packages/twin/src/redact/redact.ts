/** What replaces redacted spans; visible so readers know something was withheld. */
export const REDACTED = '[redacted]'

/** Literal never-tier terms from the CMS plus public values that must not be redacted. */
export interface RedactionRules {
  terms: readonly string[]
  allow: readonly string[]
}

/** A redaction match over the raw text. */
export interface Span {
  start: number
  end: number
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu
// Ten or more digits joined only by phone punctuation: phone numbers, never years or ranges.
const PHONE = /\+?\(?\d(?:[\s().-]{0,2}\d){9,14}/g

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** All spans to redact in `text`, merged and sorted. */
export function findSpans(text: string, rules: RedactionRules): Span[] {
  const allow = new Set(rules.allow.map((a) => a.toLowerCase()))
  const spans: Span[] = []
  const collect = (re: RegExp) => {
    for (const m of text.matchAll(re)) {
      if (allow.has(m[0].toLowerCase())) continue
      spans.push({ start: m.index, end: m.index + m[0].length })
    }
  }
  const terms = rules.terms.filter((t) => t.trim().length > 0)
  if (terms.length > 0) collect(new RegExp(terms.map(escape).join('|'), 'giu'))
  collect(EMAIL)
  collect(PHONE)
  spans.sort((a, b) => a.start - b.start)
  const merged: Span[] = []
  for (const s of spans) {
    const last = merged.at(-1)
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end)
    else merged.push({ ...s })
  }
  return merged
}

/** Replaces every span with REDACTED. */
export function redactText(text: string, rules: RedactionRules): string {
  let out = ''
  let at = 0
  for (const s of findSpans(text, rules)) {
    out += text.slice(at, s.start) + REDACTED
    at = s.end
  }
  return out + text.slice(at)
}
