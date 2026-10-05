import { scan } from './scan'

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

/** All spans to redact in `text`, merged and sorted. Allow-listed matches are left out. */
export function findSpans(text: string, rules: RedactionRules): Span[] {
  return scan(text, rules).redact
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
