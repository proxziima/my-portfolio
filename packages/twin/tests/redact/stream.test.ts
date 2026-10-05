import { describe, expect, it } from 'vitest'
import { REDACTED, StreamRedactor, redactText, type RedactionRules } from '../../src/redact'

const rules = { terms: ['Acme Secret Client'], allow: [] }

/** Feeds text in every possible two-way split and checks the output equals whole-text redaction. */
function everySplitMatches(text: string, r: RedactionRules = rules): void {
  const expected = redactText(text, r)
  for (let i = 0; i <= text.length; i++) {
    const s = new StreamRedactor(r)
    const out = s.push(text.slice(0, i)) + s.push(text.slice(i)) + s.flush()
    expect(out, `split at ${i}`).toBe(expected)
  }
}

/** Deterministic PRNG (mulberry32) so multi-way splits are reproducible without Math.random. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Feeds text in `parts` deltas at seeded cut points, `rounds` times, checking output equality each time. */
function seededSplitsMatch(text: string, r: RedactionRules, parts: number, rounds: number, seed: number): void {
  const expected = redactText(text, r)
  const rand = prng(seed)
  for (let round = 0; round < rounds; round++) {
    const cuts = Array.from({ length: parts - 1 }, () => Math.floor(rand() * (text.length + 1))).sort((a, b) => a - b)
    const bounds = [0, ...cuts, text.length]
    const s = new StreamRedactor(r)
    let out = ''
    for (let i = 0; i < parts; i++) out += s.push(text.slice(bounds[i], bounds[i + 1]))
    out += s.flush()
    expect(out, `cuts ${cuts.join(',')}`).toBe(expected)
  }
}

/** Every 2-way split plus seeded 3-way and 5-way splits. */
function allSplitsMatch(text: string, r: RedactionRules): void {
  everySplitMatches(text, r)
  seededSplitsMatch(text, r, 3, 200, 1)
  seededSplitsMatch(text, r, 5, 200, 2)
}

const pad = (n: number) => 'lorem ipsum dolor sit amet '.repeat(Math.ceil(n / 27)).slice(0, n)
const wrap = (item: string) => `${pad(120)} ${item} ${pad(120)}`
const padded = { terms: ['Acme Secret Client'], allow: ['hello@vinicius.dev'] }

describe('StreamRedactor', () => {
  it('never leaks a term split across deltas', () => {
    everySplitMatches('Before: Acme Secret Client, after.')
    everySplitMatches('reach me on vq@private.com today')
  })

  it('emits text early once it is safely past the holdback', () => {
    const r = new StreamRedactor(rules)
    const long = 'a'.repeat(200)
    expect(r.push(long).length).toBeGreaterThan(0)
    expect(r.push('Acme Secret Client') + r.flush()).toContain(REDACTED)
  })

  it('redacts a padded term under every split', () => {
    const text = wrap('Acme Secret Client')
    expect(redactText(text, padded)).toContain(REDACTED)
    allSplitsMatch(text, padded)
  })

  it('redacts a padded email with a 100-char local part under every split', () => {
    const local = 'q'.repeat(100)
    const text = wrap(`${local}@private.com`)
    expect(redactText(text, padded)).not.toContain('q')
    allSplitsMatch(text, padded)
  })

  it('redacts a padded 190-char email with a long domain under every split', () => {
    const text = wrap(`${'q'.repeat(64)}@${'d'.repeat(60)}.${'e'.repeat(60)}.com`)
    expect(redactText(text, padded)).not.toMatch(/[qde]{5}/)
    allSplitsMatch(text, padded)
  })

  it('keeps a padded allow-listed email intact under every split', () => {
    const text = wrap('hello@vinicius.dev')
    expect(redactText(text, padded)).toBe(text)
    allSplitsMatch(text, padded)
  })

  it('redacts a padded phone number under every split', () => {
    const text = wrap('+55 (11) 98765-4321')
    expect(redactText(text, padded)).toContain(REDACTED)
    allSplitsMatch(text, padded)
  })

  it('never emits the prefix of a growing email local part early', () => {
    const s = new StreamRedactor(padded)
    let out = ''
    for (const ch of `${pad(120)} ${'q'.repeat(100)}`) out += s.push(ch)
    expect(out).not.toContain('q')
    expect(out + s.push('@private.com done') + s.flush()).not.toContain('q')
  })

  it('eventually releases an adversarially long candidate token', () => {
    const s = new StreamRedactor(padded)
    expect(s.push('z'.repeat(1000)).length).toBeGreaterThan(0)
  })
})
