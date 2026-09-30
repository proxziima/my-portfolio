// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeContext {
  state: AudioContextState
  // like the real one: the state changes only once the returned promise settles
  resume = vi.fn(() => Promise.resolve().then(() => { this.state = 'running' }))
  constructor(state: AudioContextState) { this.state = state }
}

const withContext = (state: AudioContextState) => {
  const instance = new FakeContext(state)
  // a real class: `audioContext()` constructs it with `new`
  vi.stubGlobal('AudioContext', class { constructor() { return instance } })
  return instance
}

describe('safely', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('plays straight away on a running context', async () => {
    withContext('running')
    const { safely } = await import('@/lib/audio/context')
    const play = vi.fn()
    safely(play)
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('waits for resume on a suspended context, so the sound is not scheduled on a frozen clock', async () => {
    const ctx = withContext('suspended')
    const { safely } = await import('@/lib/audio/context')
    const play = vi.fn(() => expect(ctx.state).toBe('running'))
    safely(play)
    expect(play).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(1))
    expect(ctx.resume).toHaveBeenCalled()
  })

  it('never throws when the sound itself fails', async () => {
    withContext('running')
    const { safely } = await import('@/lib/audio/context')
    expect(() => safely(() => { throw new Error('boom') })).not.toThrow()
  })
})
