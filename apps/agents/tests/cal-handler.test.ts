import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const secret = 'w'.repeat(32)

const mocks = vi.hoisted(() => ({
  state: { booking: { status: 'none' }, intent: { lastEvaluationId: 'ev1' } } as {
    booking: { status: string; uid?: string; startTime?: string }
    intent: { lastEvaluationId: string | null }
  },
  failNextUpdate: false,
  failOutcome: false,
  upsert: vi.fn(),
  setOutcome: vi.fn(),
  send: vi.fn(),
}))

vi.mock('eve/channels', () => ({
  defineChannel: (c: unknown) => c,
  POST: (path: string, handler: unknown) => ({ path, handler }),
}))
vi.mock('../agent/lib/db', () => ({ db: () => ({}) }))
vi.mock('../agent/lib/env', () => ({
  getEnv: () => ({
    CAL_LINK: 'vinicius/intro',
    CAL_WEBHOOK_SECRET: secret,
    TWIN_BOOKING_REF_SECRET: 'r',
  }),
}))
vi.mock('../agent/lib/booking-ref', () => ({ verifyBookingRef: () => 'sess1' }))
vi.mock('@repo/twin/db', () => ({
  getConversation: async () => ({ visitorId: 'v', state: mocks.state }),
  upsertBooking: mocks.upsert,
  setEvaluationOutcome: mocks.setOutcome,
  updateConversation: async (_db: unknown, _id: string, update: (s: typeof mocks.state) => typeof mocks.state) => {
    if (mocks.failNextUpdate) {
      mocks.failNextUpdate = false
      throw new Error('db down')
    }
    mocks.state = update(mocks.state)
    return mocks.state
  },
}))

import channel from '../agent/channels/webhooks'

type Handler = (req: Request, ctx: unknown) => Promise<Response>
const route = (channel as unknown as { routes: { path: string; handler: Handler }[] }).routes.find(
  (r) => r.path === '/webhooks/cal',
)!.handler

function calBody(
  triggerEvent = 'BOOKING_CREATED',
  uid = 'bk_1',
  startTime = '2026-10-08T14:00:00Z',
  endTime = '2026-10-08T14:30:00Z',
  rescheduleUid?: string,
): string {
  return JSON.stringify({
    triggerEvent,
    payload: { uid, startTime, endTime, rescheduleUid, metadata: { bookingRef: 'abc.def' } },
  })
}

async function deliver(body = calBody()): Promise<Response> {
  const req = new Request('http://x/webhooks/cal', {
    method: 'POST',
    body,
    headers: { 'x-cal-signature-256': createHmac('sha256', secret).update(body).digest('hex') },
  })
  const waits: Promise<unknown>[] = []
  const res = await route(req, {
    attachSession: () => ({ send: mocks.send }),
    waitUntil: (p: Promise<unknown>) => waits.push(p),
  })
  await Promise.all(waits)
  return res
}

describe('cal webhook handler redelivery', () => {
  beforeEach(() => {
    mocks.state = { booking: { status: 'none' }, intent: { lastEvaluationId: 'ev1' } }
    mocks.failNextUpdate = false
    mocks.upsert.mockReset().mockResolvedValue({ previous: null, current: 'confirmed', changed: true })
    mocks.setOutcome.mockReset().mockResolvedValue(undefined)
    mocks.send.mockReset().mockResolvedValue({ status: 'accepted' })
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('records, sets the outcome and notifies on first delivery', async () => {
    expect((await deliver()).status).toBe(200)
    expect(mocks.state.booking).toMatchObject({ status: 'confirmed', uid: 'bk_1' })
    expect(mocks.setOutcome).toHaveBeenCalledWith({}, 'ev1', 'booked')
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })

  it('a redelivery after a failed state update still records and notifies', async () => {
    mocks.failNextUpdate = true
    await expect(deliver()).rejects.toThrow('db down')
    expect(mocks.send).not.toHaveBeenCalled()
    // Cal.com redelivers: the bookings row is already committed, so the upsert reports no change.
    mocks.upsert.mockResolvedValue({ previous: 'confirmed', current: 'confirmed', changed: false })
    expect((await deliver()).status).toBe(200)
    expect(mocks.state.booking).toMatchObject({ status: 'confirmed', uid: 'bk_1' })
    expect(mocks.setOutcome).toHaveBeenCalledTimes(1)
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })

  it('a redelivery after full success neither sets the outcome nor notifies', async () => {
    await deliver()
    mocks.upsert.mockResolvedValue({ previous: 'confirmed', current: 'confirmed', changed: false })
    expect((await deliver()).status).toBe(200)
    expect(mocks.setOutcome).toHaveBeenCalledTimes(1)
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })

  it('a failed outcome write does not prevent the notice', async () => {
    mocks.setOutcome.mockRejectedValue(new Error('outcome down'))
    expect((await deliver()).status).toBe(200)
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })

  it('a late create for a cancelled uid keeps the cancelled status', async () => {
    mocks.state = { booking: { status: 'cancelled', uid: 'bk_1' }, intent: { lastEvaluationId: 'ev1' } }
    mocks.upsert.mockResolvedValue({ previous: 'cancelled', current: 'cancelled', changed: false })
    await deliver()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.state.booking.status).toBe('cancelled')
  })

  it('a duplicate create for the original uid after a reschedule neither rolls back nor notifies', async () => {
    // CREATED A: new row.
    await deliver()
    // RESCHEDULED B: Cal.com gives the reschedule a new uid, so a new row.
    mocks.upsert.mockResolvedValue({ previous: null, current: 'rescheduled', changed: true })
    await deliver(calBody('BOOKING_RESCHEDULED', 'bk_2', '2026-10-09T15:00:00Z', '2026-10-09T15:30:00Z'))
    expect(mocks.state.booking).toMatchObject({ status: 'rescheduled', uid: 'bk_2' })
    expect(mocks.send).toHaveBeenCalledTimes(2)
    // CREATED A again (duplicate or retry): A's row is unchanged.
    mocks.upsert.mockResolvedValue({ previous: 'confirmed', current: 'confirmed', changed: false })
    expect((await deliver()).status).toBe(200)
    expect(mocks.state.booking).toMatchObject({
      status: 'rescheduled',
      uid: 'bk_2',
      startTime: '2026-10-09T15:00:00Z',
    })
    expect(mocks.send).toHaveBeenCalledTimes(2)
    expect(mocks.setOutcome).toHaveBeenCalledTimes(1)
  })

  it('a retried reschedule after a failed state write records the successor and notifies once', async () => {
    // CREATED A.
    await deliver()
    expect(mocks.send).toHaveBeenCalledTimes(1)
    // RESCHEDULED B (links A): the row commits, then the state write fails.
    const b = calBody('BOOKING_RESCHEDULED', 'bk_2', '2026-10-09T15:00:00Z', '2026-10-09T15:30:00Z', 'bk_1')
    mocks.upsert.mockResolvedValue({ previous: null, current: 'rescheduled', changed: true })
    mocks.failNextUpdate = true
    await expect(deliver(b)).rejects.toThrow('db down')
    expect(mocks.state.booking).toMatchObject({ status: 'confirmed', uid: 'bk_1' })
    expect(mocks.send).toHaveBeenCalledTimes(1)
    // Cal.com redelivers B: its row is unchanged now, but it is A's legitimate successor.
    mocks.upsert.mockResolvedValue({ previous: 'rescheduled', current: 'rescheduled', changed: false })
    expect((await deliver(b)).status).toBe(200)
    expect(mocks.state.booking).toMatchObject({
      status: 'rescheduled',
      uid: 'bk_2',
      startTime: '2026-10-09T15:00:00Z',
    })
    expect(mocks.send).toHaveBeenCalledTimes(2)
    expect(mocks.send.mock.calls[1]?.[0]).toContain('2026-10-09T15:00:00Z')
    // A third delivery of B finds the state matching and stays quiet.
    expect((await deliver(b)).status).toBe(200)
    expect(mocks.send).toHaveBeenCalledTimes(2)
    // A stale CREATED A afterwards is still skipped, no rollback.
    mocks.upsert.mockResolvedValue({ previous: 'confirmed', current: 'confirmed', changed: false })
    expect((await deliver()).status).toBe(200)
    expect(mocks.state.booking).toMatchObject({ status: 'rescheduled', uid: 'bk_2' })
    expect(mocks.send).toHaveBeenCalledTimes(2)
  })

  it('a same-uid reschedule that only moves the start time is recorded and notified', async () => {
    mocks.upsert.mockResolvedValue({ previous: null, current: 'rescheduled', changed: true })
    const first = calBody('BOOKING_RESCHEDULED', 'bk_1', '2026-10-08T14:00:00Z', '2026-10-08T14:30:00Z')
    await deliver(first)
    expect(mocks.send).toHaveBeenCalledTimes(1)
    // Same uid and status, new time: the row's status is unchanged.
    mocks.upsert.mockResolvedValue({ previous: 'rescheduled', current: 'rescheduled', changed: false })
    await deliver(calBody('BOOKING_RESCHEDULED', 'bk_1', '2026-10-10T09:00:00Z', '2026-10-10T09:30:00Z'))
    expect(mocks.state.booking).toMatchObject({
      status: 'rescheduled',
      uid: 'bk_1',
      startTime: '2026-10-10T09:00:00Z',
    })
    expect(mocks.send).toHaveBeenCalledTimes(2)
    expect(mocks.send.mock.calls[1]?.[0]).toContain('2026-10-10T09:00:00Z')
  })
})
