'use client'
// eve appends its routes to `host`, so `origin + '/api/twin'` reaches the BFF at /api/twin/eve/v1/... (verified in D3).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ClientError } from 'eve/client'
import { useEveAgent } from 'eve/react'
import { REFUSAL_STATUS, type TwinRefusal } from '@repo/twin/contract'
import { isParked, toLines, type Line } from './parts'

const SESSION_KEY = 'twin-session'

type Refusal = TwinRefusal['kind']

/** Reads the saved session; storage can be unavailable (private mode), which just means no resume. */
function savedSession(): { sessionId: string; streamIndex: number } | undefined {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as { sessionId: string; streamIndex: number }) : undefined
  } catch {
    return undefined
  }
}

/** Maps a failed turn's HTTP status to the refusal the window explains in character. */
function refusalOf(error: unknown): Refusal {
  // Anything without an HTTP status (network failure, a stream that never opened) reads as offline.
  const status = error instanceof ClientError ? error.status : undefined
  const entry = Object.entries(REFUSAL_STATUS).find(([, s]) => s === status)
  return (entry?.[0] as Refusal | undefined) ?? 'offline'
}

/** The server no longer has the saved session (expired, or its data was erased). */
function isGone(error: unknown): boolean {
  return error instanceof ClientError && error.status === 404
}

/**
 * The live conversation with the twin through the BFF (`/api/twin`). Persists the session so a
 * reload or dropped connection resumes the same stream from where it stopped.
 */
export function useTwin() {
  const [initial] = useState(savedSession)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const agent = useEveAgent({
    host: `${window.location.origin}/api/twin`,
    headers: () => ({ 'x-twin-tz': Intl.DateTimeFormat().resolvedOptions().timeZone }),
    initialSession: initial,
    resume: initial !== undefined,
    onSessionChange: (s) => {
      try {
        if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s))
        else window.localStorage.removeItem(SESSION_KEY)
      } catch {
        // Storage unavailable: the conversation still works, it just won't resume after reload.
      }
    },
  })
  const lines: Line[] = useMemo(() => toLines(agent.data.messages), [agent.data.messages])
  // An approval task holds the turn open for up to 15 minutes (`turn.waiting` on "tasks"), during
  // which eve keeps the session non-ready. "Typing" must mean text is actually being produced: the
  // turn is submitted, or streaming and not parked on a `turn.waiting`.
  const typing = agent.status === 'submitted' || (agent.status === 'streaming' && !isParked(agent.events))

  const { send: sendTurn, reset: resetAgent } = agent
  const reset = useCallback(() => {
    setRefusal(null)
    resetAgent()
  }, [resetAgent])

  // A saved session the server dropped fails every stream open with 404, which would read as
  // "offline" for good. The first time that happens the window starts a fresh session instead;
  // after that a 404 is explained like any other failure, so a broken server can never loop us.
  const renewed = useRef(false)
  /** Handles a failed turn; true when it started a fresh session instead of explaining it. */
  const fail = useCallback(
    (error: unknown): boolean => {
      if (isGone(error) && !renewed.current) {
        renewed.current = true
        reset()
        return true
      }
      setRefusal(refusalOf(error))
      return false
    },
    [reset],
  )

  const send = useCallback(
    async (input: string) => {
      const text = input.trim()
      if (!text) return
      setRefusal(null)
      // A first turn's HTTP failure lands in `agent.error`; a follow-up sent mid-turn rejects instead.
      try {
        await sendTurn(text)
      } catch (error) {
        if (!fail(error)) return
        // The session was gone: the visitor's message goes to the fresh one.
        try {
          await sendTurn(text)
        } catch (retryError) {
          setRefusal(refusalOf(retryError))
        }
      }
    },
    [sendTurn, fail],
  )

  useEffect(() => {
    if (agent.error) fail(agent.error)
  }, [agent.error, fail])

  return { lines, typing, refusal, send, reset }
}
