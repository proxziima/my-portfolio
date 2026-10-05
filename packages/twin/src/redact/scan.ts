import type { RedactionRules, Span } from './redact'

/**
 * Internal matching for redaction. It lives outside `redact.ts` so the guard spans and token
 * helpers stay private to the package instead of joining the `export *` public surface.
 */

// Bounded per RFC 5321 (64-char local part, 63-char labels) so a long run that never becomes an
// email costs linear time instead of the quadratic backtracking an unbounded `+` would cause.
const EMAIL = /[\p{L}\p{N}._%+-]{1,64}@(?:[\p{L}\p{N}-]{1,63}\.){1,8}\p{L}{2,63}/gu
// Ten or more digits joined only by phone punctuation: phone numbers, never years or ranges.
const PHONE = /\+?\(?\d(?:[\s().-]{0,2}\d){9,14}/g
const LOCAL_CHAR = /^[\p{L}\p{N}._%+-]$/u
// Anything an email or phone may still grow through: the local part, '@', domain and digits.
const TOKEN_CHAR = /^[\p{L}\p{N}._%+@-]$/u

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Reads one code point ending at `end` (exclusive), so astral letters count as one char. */
function charBefore(text: string, end: number): string {
  const low = text.charCodeAt(end - 1)
  if (low >= 0xdc00 && low <= 0xdfff && end >= 2) {
    const high = text.charCodeAt(end - 2)
    if (high >= 0xd800 && high <= 0xdbff) return text.slice(end - 2, end)
  }
  return text.slice(end - 1, end)
}

/** Start of the run of `re` chars ending at `end`, not going below `floor` nor past `limit` chars. */
function runStart(text: string, end: number, re: RegExp, floor: number, limit = Infinity): number {
  let at = end
  while (at > floor && end - at <= limit) {
    const ch = charBefore(text, at)
    if (!re.test(ch)) break
    at -= ch.length
  }
  return at
}

/**
 * Start of the trailing token that could still grow into an email or phone match, scanning at
 * most `limit + 1` chars back. Returns `text.length` when the text ends on a separator.
 */
export function trailingTokenStart(text: string, limit: number): number {
  return runStart(text, text.length, TOKEN_CHAR, 0, limit)
}

function merge(spans: Span[]): Span[] {
  spans.sort((a, b) => a.start - b.start)
  const merged: Span[] = []
  for (const s of spans) {
    const last = merged.at(-1)
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end)
    else merged.push({ ...s })
  }
  return merged
}

/**
 * `redact` holds the spans to replace. `guard` also holds allow-listed matches: they are never
 * replaced, but a stream must not cut inside them either, or the half after the cut is re-scanned
 * alone, stops matching the allow-list and gets redacted.
 */
export function scan(text: string, rules: RedactionRules): { redact: Span[]; guard: Span[] } {
  const allow = new Set(rules.allow.map((a) => a.toLowerCase()))
  const redact: Span[] = []
  const allowed: Span[] = []
  const add = (start: number, end: number) => {
    const span = { start, end }
    if (allow.has(text.slice(start, end).toLowerCase())) allowed.push(span)
    else redact.push(span)
  }
  // Longest first, so a term that prefixes another never wins the alternation and leaks the rest.
  const terms = rules.terms
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .sort((a, b) => b.length - a.length)
  if (terms.length > 0) {
    for (const m of text.matchAll(new RegExp(terms.map(escape).join('|'), 'giu'))) add(m.index, m.index + m[0].length)
  }
  // The bounded local part can start mid-run; widen back over the whole run so no prefix leaks.
  let floor = 0
  for (const m of text.matchAll(EMAIL)) {
    const end = m.index + m[0].length
    add(runStart(text, m.index, LOCAL_CHAR, floor), end)
    floor = end
  }
  for (const m of text.matchAll(PHONE)) add(m.index, m.index + m[0].length)
  return { redact: merge(redact), guard: merge([...redact, ...allowed]) }
}
