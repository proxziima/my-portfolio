import { describe, expect, it, vi } from 'vitest'

const conv = vi.hoisted(() => ({ ensureConversation: vi.fn(), countTurn: vi.fn() }))
vi.mock('../agent/lib/conversation', () => conv)

const { default: hook } = await import('../agent/hooks/conversation')
const turnStarted = hook.events?.['turn.started'] as (event: unknown, ctx: unknown) => Promise<void>
const event = { type: 'turn.started', data: { turnId: 't1', sequence: 1 }, meta: { id: 'evt_1', at: '' } }

describe('conversation hook', () => {
  it('counts the turn', async () => {
    conv.ensureConversation.mockResolvedValueOnce({})
    const cancel = vi.fn()
    await turnStarted(event, { session: { id: 's1', auth: { current: null } }, cancel })
    expect(conv.countTurn).toHaveBeenCalledWith('s1', 't1')
    expect(cancel).not.toHaveBeenCalled()
  })

  it('cancels the turn, logs the session and rethrows when bookkeeping fails', async () => {
    conv.ensureConversation.mockRejectedValueOnce(new Error('db down'))
    const cancel = vi.fn()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(turnStarted(event, { session: { id: 's1', auth: { current: null } }, cancel })).rejects.toThrow('db down')
    expect(cancel).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.join(' ')).toContain('s1')
  })
})
