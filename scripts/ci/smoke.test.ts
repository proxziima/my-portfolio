import { describe, expect, it } from 'bun:test'
import { cmsServes, waitFor, webServes, type Probe } from './smoke'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

describe('webServes', () => {
  it('is ok when /api/health reports the expected version', async () => {
    const seen: string[] = []
    const probe = await webServes(
      async (url) => (seen.push(String(url)), json(200, { ok: true, version: 'abc' })),
      'https://w.test',
      'abc',
    )
    expect(probe).toEqual({ ok: true, detail: 'web serves abc' })
    expect(seen).toEqual(['https://w.test/api/health'])
  })

  it('waits while the old version is still serving', async () => {
    const probe = await webServes(
      async () => json(200, { ok: true, version: 'old' }),
      'https://w.test',
      'new',
    )
    expect(probe).toEqual({ ok: false, detail: 'web serves old, waiting for new' })
  })

  it('reports a bad status and an unreachable host', async () => {
    expect((await webServes(async () => json(502, {}), 'https://w.test', 'v')).detail).toBe(
      'web /api/health answered 502',
    )
    const down = await webServes(
      async () => {
        throw new Error('ECONNREFUSED')
      },
      'https://w.test',
      'v',
    )
    expect(down).toEqual({ ok: false, detail: 'web unreachable: ECONNREFUSED' })
  })
})

describe('cmsServes', () => {
  it('is ok when the public profile global answers 200', async () => {
    const seen: string[] = []
    const probe = await cmsServes(
      async (url) => (seen.push(String(url)), json(200, {})),
      'https://c.test',
    )
    expect(probe.ok).toBe(true)
    expect(seen).toEqual(['https://c.test/api/globals/profile'])
  })

  it('is not ok on an error status', async () => {
    expect(await cmsServes(async () => json(503, {}), 'https://c.test')).toEqual({
      ok: false,
      detail: 'cms answered 503',
    })
  })
})

describe('waitFor', () => {
  it('retries until the probe passes', async () => {
    let calls = 0
    let clock = 0
    const result = await waitFor(
      async (): Promise<Probe> =>
        ++calls < 3 ? { ok: false, detail: 'not yet' } : { ok: true, detail: 'up' },
      {
        timeoutMs: 60_000,
        intervalMs: 10_000,
        sleep: async (ms) => void (clock += ms),
        now: () => clock,
      },
    )
    expect(result).toEqual({ ok: true, detail: 'up' })
    expect(calls).toBe(3)
  })

  it('gives up after the timeout with the last detail', async () => {
    let clock = 0
    const result = await waitFor(async () => ({ ok: false, detail: `t=${clock}` }), {
      timeoutMs: 30_000,
      intervalMs: 10_000,
      sleep: async (ms) => void (clock += ms),
      now: () => clock,
    })
    expect(result).toEqual({ ok: false, detail: 't=30000' })
  })
})
