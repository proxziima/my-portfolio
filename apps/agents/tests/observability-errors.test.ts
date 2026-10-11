import { describe, expect, it, vi } from 'vitest'
import { reportAgentFailure } from '../agent/lib/observability/errors'

describe('reportAgentFailure', () => {
  it('reports a failure with its session, turn and kind', () => {
    const capture = vi.fn()
    reportAgentFailure(capture, 'turn', { error: new Error('x'), sessionId: 's-1', turnId: 't-1' })
    expect(capture).toHaveBeenCalledWith(expect.any(Error), { distinctId: 'twin-agent', properties: { kind: 'turn', sessionId: 's-1', turnId: 't-1' } })
  })
  it('wraps a non-Error cause so the stack view still works', () => {
    const capture = vi.fn()
    reportAgentFailure(capture, 'model', { error: 'rate limited', sessionId: 's-1' })
    const [error] = capture.mock.calls[0]!
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('rate limited')
  })
  it('reports a tool call that genuinely failed', () => {
    const capture = vi.fn()
    reportAgentFailure(capture, 'tool', { error: new Error('x'), sessionId: 's-1', outcome: 'failed' })
    expect(capture).toHaveBeenCalledWith(expect.any(Error), { distinctId: 'twin-agent', properties: { kind: 'tool', sessionId: 's-1' } })
  })
  it('treats a failed tool call without an outcome as a failure', () => {
    const capture = vi.fn()
    reportAgentFailure(capture, 'tool', { error: new Error('x'), sessionId: 's-1' })
    expect(capture).toHaveBeenCalledOnce()
  })
  it.each(['cancelled', 'rejected', 'abandoned'])('skips tool calls that were %s', (outcome) => {
    const capture = vi.fn()
    reportAgentFailure(capture, 'tool', { error: new Error('x'), sessionId: 's-1', outcome })
    expect(capture).not.toHaveBeenCalled()
  })
})
