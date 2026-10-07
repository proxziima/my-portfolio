// @vitest-environment node
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { normalizeIcon } from '@/favicons/normalize'
import { isBoundedSvg } from '@/favicons/svg-check'

// The real spawn, noting when a render process starts: the pre-check's work ends there.
const timing = vi.hoisted(() => ({ spawnedAt: 0 }))
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const real = actual.spawn as (...args: unknown[]) => ChildProcess
  return {
    ...actual,
    spawn: vi.fn((...args: unknown[]) => {
      timing.spawnedAt = performance.now()
      return real(...args)
    }),
  }
})

/** The pre-check runs in the CMS process, so it must stay linear: no input may stall the event loop. */
const BUDGET_MS = 200
const SIZE = 511_000
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/>'
const CLOSE = '</svg>'
/** A trivial SVG padded with `unit` up to about 511 KB. */
const padded = (unit: string) => Buffer.from(OPEN + unit.repeat(Math.floor((SIZE - OPEN.length - CLOSE.length) / unit.length)) + CLOSE)
/** A trivial SVG with one `prefix` + whitespace run + `suffix` structure filling about 511 KB. */
const spaced = (prefix: string, suffix: string) =>
  Buffer.from(OPEN + prefix + ' '.repeat(SIZE - OPEN.length - CLOSE.length - prefix.length - suffix.length) + suffix + CLOSE)

const cases: [string, Buffer][] = [
  ...['<a', '</', '<!DOCTYPE', '<!DOCTYPE [', ' id="a"', 'url(#', 'href="#', '<!--', '<![CDATA[', '<?'].map(
    (unit): [string, Buffer] => [`"${unit}" repeated`, padded(unit)],
  ),
  ['a url( followed by a long whitespace run', spaced('<rect width="1" height="1" style="fill:url(', 'x)"/>')],
  ['an href value that is a long whitespace run', spaced('<use href="', 'x"/>')],
  ['an end tag inside many open elements', Buffer.from(OPEN + '<g>'.repeat(4000) + '</x>'.repeat(120_000) + CLOSE)],
]

describe('isBoundedSvg runs in linear time', () => {
  it.each(cases)('on %s', (_, doc) => {
    expect(doc.length).toBeGreaterThan(400_000)
    const started = performance.now()
    isBoundedSvg(doc)
    expect(performance.now() - started).toBeLessThan(BUDGET_MS)
  })
})

// Inputs that pass the pre-check start a real render process (killed at once); allow for a loaded machine.
describe('normalizeIcon reaches a verdict or a render in linear time', { timeout: 10_000 }, () => {
  it.each(cases)('on %s', async (_, doc) => {
    timing.spawnedAt = 0
    const started = performance.now()
    await normalizeIcon(doc, { timeoutMs: 1, memoryMb: 256 })
    const precheckDone = timing.spawnedAt || performance.now()
    expect(precheckDone - started).toBeLessThan(BUDGET_MS)
  })
})
