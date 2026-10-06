import { deleteVisitor, listVisitorSessions } from '@repo/twin/db'
import { cookies } from 'next/headers'
import { VISITOR_COOKIE } from '@/lib/twin/cookie'
import { twinDb } from '@/lib/twin/db'
import { agentFetch } from '@/lib/twin/upstream'
import { existingVisitor } from '@/lib/twin/visitor'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/twin/me: erase this visitor (spec §8). Retires their eve sessions (run data goes
 * with retention 0), deletes every row they own, and forgets the cookie. If retiring a session
 * fails the rows are kept (so the visitor can retry), the failure is logged, and the response is
 * a bare 500: never a silent half-deletion.
 */
export async function DELETE() {
  const visitorId = await existingVisitor()
  if (!visitorId) return new Response(null, { status: 204 })
  try {
    for (const sessionId of await listVisitorSessions(twinDb(), visitorId)) {
      const res = await agentFetch(`session/${sessionId}/reset`, visitorId, { method: 'POST', body: { reason: 'visitor deletion request' } })
      if (!res.ok && res.status !== 404 && res.status !== 409) throw new Error(`reset ${sessionId} failed with ${res.status}`)
    }
    await deleteVisitor(twinDb(), visitorId)
  } catch (error) {
    console.error('twin visitor deletion failed', error)
    return new Response(null, { status: 500 })
  }
  ;(await cookies()).delete(VISITOR_COOKIE)
  return new Response(null, { status: 204 })
}
