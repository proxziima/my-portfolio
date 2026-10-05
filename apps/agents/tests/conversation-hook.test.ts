import { beforeEach, describe, expect, it, vi } from 'vitest'

const conv = vi.hoisted(() => ({ ensureConversation: vi.fn(), countTurn: vi.fn(), pruneSettledApprovals: vi.fn() }))
const transcript = vi.hoisted(() => ({ recordMessage: vi.fn() }))
const intent = vi.hoisted(() => ({ evaluateCallIntent: vi.fn() }))
vi.mock('../agent/lib/conversation', () => conv)
vi.mock('../agent/lib/transcript', () => transcript)
vi.mock('../agent/lib/intent/evaluate', () => intent)

const { default: hook } = await import('../agent/hooks/conversation')
type Handler = (event: unknown, ctx: unknown) => Promise<void>
const turnStarted = hook.events?.['turn.started'] as Handler
const messageReceived = hook.events?.['message.received'] as Handler
const messageCompleted = hook.events?.['message.completed'] as Handler
const event = { type: 'turn.started', data: { turnId: 't1', sequence: 1 }, meta: { id: 'evt_1', at: '' } }
const completed = (finishReason: string) => ({
  type: 'message.completed',
  data: { finishReason, message: 'Happy to talk.', sequence: 3, stepIndex: 0, turnId: 't1' },
  meta: { id: 'evt_3', at: '' },
})
const ctxOf = (cancel = vi.fn()) => ({ session: { id: 's1', auth: { current: null } }, cancel })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('conversation hook', () => {
  it('counts the turn', async () => {
    conv.ensureConversation.mockResolvedValueOnce({})
    const cancel = vi.fn()
    await turnStarted(event, ctxOf(cancel))
    expect(conv.countTurn).toHaveBeenCalledWith('s1', 't1')
    expect(cancel).not.toHaveBeenCalled()
  })

  it('prunes approvals settled while their run was gone, after counting the turn', async () => {
    const order: string[] = []
    conv.countTurn.mockImplementationOnce(async () => void order.push('count'))
    conv.pruneSettledApprovals.mockImplementationOnce(async () => void order.push('prune'))
    await turnStarted(event, ctxOf())
    expect(conv.pruneSettledApprovals).toHaveBeenCalledWith('s1')
    expect(order).toEqual(['count', 'prune'])
  })

  it('fails closed when pruning stale approvals fails', async () => {
    conv.pruneSettledApprovals.mockRejectedValueOnce(new Error('db down'))
    const cancel = vi.fn()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(turnStarted(event, ctxOf(cancel))).rejects.toThrow('db down')
    expect(cancel).toHaveBeenCalledOnce()
    log.mockRestore()
  })

  it('cancels the turn, logs the session and rethrows when bookkeeping fails', async () => {
    conv.ensureConversation.mockRejectedValueOnce(new Error('db down'))
    const cancel = vi.fn()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(turnStarted(event, ctxOf(cancel))).rejects.toThrow('db down')
    expect(cancel).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.join(' ')).toContain('s1')
    log.mockRestore()
  })

  it('records the visitor message', async () => {
    const received = { type: 'message.received', data: { message: 'Hi there', sequence: 2, turnId: 't1' }, meta: { id: 'evt_2', at: '' } }
    await messageReceived(received, ctxOf())
    expect(transcript.recordMessage).toHaveBeenCalledWith('s1', 'visitor', 't1', 2, 'Hi there')
  })

  it('ignores interim narration before tool calls', async () => {
    await messageCompleted(completed('tool-calls'), ctxOf())
    expect(transcript.recordMessage).not.toHaveBeenCalled()
    expect(intent.evaluateCallIntent).not.toHaveBeenCalled()
  })

  it('records a final reply and then evaluates intent', async () => {
    const order: string[] = []
    transcript.recordMessage.mockImplementationOnce(async () => void order.push('record'))
    intent.evaluateCallIntent.mockImplementationOnce(async () => void order.push('evaluate'))
    await messageCompleted(completed('stop'), ctxOf())
    expect(transcript.recordMessage).toHaveBeenCalledWith('s1', 'twin', 't1', 3, 'Happy to talk.')
    expect(intent.evaluateCallIntent).toHaveBeenCalledWith('s1', 't1', 3)
    expect(order).toEqual(['record', 'evaluate'])
  })

  it('logs with the session id and rethrows without cancelling when evaluation fails', async () => {
    intent.evaluateCallIntent.mockRejectedValueOnce(new Error('db down'))
    const cancel = vi.fn()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(messageCompleted(completed('stop'), ctxOf(cancel))).rejects.toThrow('db down')
    expect(cancel).not.toHaveBeenCalled()
    expect(log.mock.calls[0]?.join(' ')).toContain('s1')
    log.mockRestore()
  })

  it('logs with the session id and rethrows without cancelling when the transcript fails', async () => {
    transcript.recordMessage.mockRejectedValueOnce(new Error('cms down'))
    const cancel = vi.fn()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const received = { type: 'message.received', data: { message: 'Hi', sequence: 2, turnId: 't1' }, meta: { id: 'evt_2', at: '' } }
    await expect(messageReceived(received, ctxOf(cancel))).rejects.toThrow('cms down')
    expect(cancel).not.toHaveBeenCalled()
    expect(log.mock.calls[0]?.join(' ')).toContain('s1')
    log.mockRestore()
  })
})
