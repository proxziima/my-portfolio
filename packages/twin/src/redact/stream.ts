import { findSpans, redactText, type RedactionRules } from './redact'

const MIN_HOLDBACK = 64

/**
 * Redacts a text stream delivered in deltas. It holds back the last K characters, where K is at
 * least the longest term, so a sensitive term split across deltas is always seen whole before
 * anything around it is emitted.
 */
export class StreamRedactor {
  private pending = ''
  private readonly holdback: number

  constructor(private readonly rules: RedactionRules) {
    this.holdback = Math.max(MIN_HOLDBACK, ...rules.terms.map((t) => t.length))
  }

  /** Adds a delta and returns the text that is now safe to emit (possibly empty). */
  push(delta: string): string {
    this.pending += delta
    let cut = this.pending.length - this.holdback
    if (cut <= 0) return ''
    // A match crossing the cut is deferred whole, so it is redacted once complete.
    for (const s of findSpans(this.pending, this.rules)) {
      if (s.start < cut && s.end > cut) cut = s.start
    }
    const ready = this.pending.slice(0, cut)
    this.pending = this.pending.slice(cut)
    return redactText(ready, this.rules)
  }

  /** Emits whatever is held back; call when the message completes. */
  flush(): string {
    const out = redactText(this.pending, this.rules)
    this.pending = ''
    return out
  }
}
