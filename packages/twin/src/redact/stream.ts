import { redactText, type RedactionRules } from './redact'
import { scan, trailingTokenStart } from './scan'

const MIN_HOLDBACK = 64

/**
 * Bounds on the trailing token held back while it might still become an email or phone, so
 * adversarial input (one endless word) cannot stall the stream forever. The whole token, `@domain`
 * included, is held up to 256 chars (RFC 5321 caps an address at 254). Before any '@' arrives it
 * is only a would-be local part, which RFC 5321 caps at 64, so it is held up to 128 chars; past
 * that, ordinary long words keep flowing. The cost of either bound is that a candidate beyond it
 * which later completes into an email may have its start emitted unredacted.
 */
const MAX_CANDIDATE = 256
const MAX_LOCAL_CANDIDATE = 128

/**
 * Redacts a text stream delivered in deltas. Concatenated `push` outputs plus `flush` equal
 * `redactText` of the whole message, and nothing is emitted before it can be judged. It holds back
 * the last K characters, where K is at least the longest term, so a sensitive term split across
 * deltas is always seen whole; it also never cuts inside a match (redacted or allow-listed) nor
 * inside a trailing token that could still grow into one, such as an email whose `@domain` has not
 * arrived yet.
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
    const end = this.pending.length
    const token = trailingTokenStart(this.pending, MAX_CANDIDATE)
    const at = this.pending.indexOf('@', token)
    const localLength = (at === -1 ? end : at) - token
    if (end - token <= MAX_CANDIDATE && localLength <= MAX_LOCAL_CANDIDATE) cut = Math.min(cut, token)
    // A match crossing the cut is deferred whole, so it is judged once complete. Guard spans are
    // merged, so at most one can cross and moving the cut to its start never crosses another.
    for (const s of scan(this.pending, this.rules).guard) {
      if (s.start < cut && s.end > cut) cut = s.start
    }
    if (cut <= 0) return ''
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
