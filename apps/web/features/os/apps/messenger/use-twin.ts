'use client'
// eve appends its routes to `host`, so `origin + '/api/twin'` reaches the BFF at /api/twin/eve/v1/... (verified in D3).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ClientError } from 'eve/client'
import { useEveAgent } from 'eve/react'
import { REFUSAL_STATUS, type TwinRefusal } from '@repo/twin/contract'
import { track } from '@/lib/analytics/events'
import { startExperience, type ExperienceTimer } from '@/lib/analytics/experience'
import { hasNewReply, messageSentProps, replyIds } from './twin-analytics'
import { hasFailed, isParked, toLines, type Line } from './parts'

const SESSION_KEY = 'twin-session'

/**
 * How long a saved session may stay resuming before the window gives up on it. A healthy resume
 * catches up in about a second; a session whose run died before publishing anything never does,
 * because its stream serves no events up to the tail index eve waits for.
 */
const RESUME_STALL_MS = 10_000

/** How long a sent message may wait for the twin's first text before it is reported as a timeout. */
export const TWIN_REPLY_TIMEOUT_MS = 60_000

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

interface MessageLike {
  id: string
  role: string
  metadata?: unknown
  parts: readonly { type: string; text?: string }[]
}

/** The server recorded a visitor message with this text (an optimistic echo doesn't count). */
function acknowledged(messages: readonly MessageLike[], text: string): boolean {
  return messages.some(
    (m) =>
      m.role === 'user' &&
      (m.metadata as { optimistic?: boolean } | undefined)?.optimistic !== true &&
      m.parts.some((p) => p.type === 'text' && p.text === text),
  )
}

/**
 * The live conversation with the twin through the BFF (`/api/twin`). Persists the session so a
 * reload or dropped connection resumes the same stream from where it stopped.
 */
export function useTwin() {
  const [initial] = useState(savedSession)
  useEffect(() => {
    track('twin_session_started', { resumed: initial !== undefined })
  }, [initial])
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
  // The first-reply measurement in flight, one at a time: a message sent before the reply keeps
  // timing the first. `before` is what the twin had already said at the send.
  const reply = useRef<{ timer: ExperienceTimer; before: ReadonlySet<string>; giveUp: ReturnType<typeof setTimeout> } | null>(null)
  /** Closes the open measurement with `end`, or silently without it. */
  const endReply = useCallback((end?: (timer: ExperienceTimer) => void) => {
    const open = reply.current
    if (!open) return
    reply.current = null
    clearTimeout(open.giveUp)
    end?.(open.timer)
  }, [])
  /** Shows the visitor a refusal and records it; one place so the two can't drift. */
  const refuse = useCallback((reason: Refusal) => {
    setRefusal(reason)
    track('twin_refusal', { reason })
    endReply((timer) => timer.failed(reason))
  }, [endReply])
  // Read inside callbacks, which must not be recreated on every status change.
  const status = useRef(agent.status)
  status.current = agent.status
  /** A message sent while the saved session was still resuming, delivered once it settles. */
  const held = useRef<string | null>(null)
  const reset = useCallback(() => {
    setRefusal(null)
    resetAgent()
  }, [resetAgent])

  // A saved session the server dropped (404) or one that failed for good (`session.failed`) would
  // read as "offline" forever. The first time either happens the window starts a fresh session
  // instead; after that it is explained like any other failure, so a broken server can't loop us.
  const renewed = useRef(false)
  /** Starts a fresh session, at most once per window; true when it did. */
  const renew = useCallback((): boolean => {
    if (renewed.current) return false
    renewed.current = true
    track('twin_session_renewed', {})
    reset()
    return true
  }, [reset])
  /** Handles a failed turn; true when it started a fresh session instead of explaining it. */
  const fail = useCallback(
    (error: unknown): boolean => {
      if (isGone(error) && renew()) return true
      refuse(refusalOf(error))
      return false
    },
    [renew, refuse],
  )

  // The last text submitted through `send`, so a first turn whose session turned out to be gone
  // (a 404 through `agent.error`) can be resent to the fresh session instead of being dropped.
  const lastSent = useRef<string | null>(null)
  const messages = useRef<readonly MessageLike[]>(agent.data.messages)
  useEffect(() => {
    messages.current = agent.data.messages
  }, [agent.data.messages])

  const resend = useCallback(
    async (text: string) => {
      try {
        await sendTurn(text)
      } catch (retryError) {
        refuse(refusalOf(retryError))
      }
    },
    [sendTurn, refuse],
  )

  const send = useCallback(
    async (input: string) => {
      const text = input.trim()
      if (!text) return
      setRefusal(null)
      // eve rejects a send while it resumes; hold the message until the resume settles or is renewed.
      if (status.current === 'resuming') {
        held.current = text
        return
      }
      lastSent.current = text
      track('twin_message_sent', messageSentProps(text, messages.current.filter((m) => m.role === 'user').length))
      reply.current ??= {
        timer: startExperience('twin_first_reply'),
        before: replyIds(messages.current),
        giveUp: setTimeout(() => endReply((timer) => timer.failed('timeout')), TWIN_REPLY_TIMEOUT_MS),
      }
      // A first turn's HTTP failure lands in `agent.error`; a follow-up sent mid-turn rejects instead.
      try {
        await sendTurn(text)
      } catch (error) {
        // Resent right here if the session was gone, so the error path must not resend it too.
        lastSent.current = null
        if (!fail(error)) return
        // The session was gone: the visitor's message goes to the fresh one.
        await resend(text)
      }
    },
    [sendTurn, fail, resend, endReply],
  )

  // the first twin text that was not on screen at the send ends the measurement (a renewal keeps it open)
  useEffect(() => {
    const open = reply.current
    if (open && hasNewReply(agent.data.messages, open.before)) endReply((timer) => timer.ready())
  }, [agent.data.messages, endReply])
  // a window closed before the reply reports nothing
  useEffect(() => () => endReply(), [endReply])

  // A failed session never answers the message that was in flight, so it goes to the fresh one.
  // A saved session found already failed on load renews without resending anything.
  const failed = hasFailed(agent.events)
  useEffect(() => {
    if (!failed) return
    const text = lastSent.current
    if (!renew()) {
      refuse('offline')
      return
    }
    lastSent.current = null
    if (text !== null) void resend(text)
  }, [failed, renew, resend, refuse])

  useEffect(() => {
    // A failed session is handled above, from the stream; its error must not also become a refusal.
    if (!agent.error || failed) return
    // Read before `fail`: a reset clears the messages.
    const text = lastSent.current
    const owed = text !== null && !acknowledged(messages.current, text) ? text : null
    // `fail` renews the session at most once, so this resends at most once.
    if (fail(agent.error) && owed !== null) {
      lastSent.current = null
      void resend(owed)
    }
  }, [agent.error, failed, fail, resend])

  // A saved session stuck resuming would refuse every message as "offline": start over instead,
  // under the same at-most-once rule as a 404 or a failed session.
  useEffect(() => {
    if (agent.status !== 'resuming') return
    const timer = setTimeout(() => {
      if (renew()) return
      refuse('offline')
    }, RESUME_STALL_MS)
    return () => clearTimeout(timer)
  }, [agent.status, renew, refuse])

  // Delivers the held message once the session can take it (resumed, or renewed and ready).
  useEffect(() => {
    if (agent.status === 'resuming' || held.current === null) return
    const text = held.current
    held.current = null
    void send(text)
  }, [agent.status, send])

  return { lines, typing, refusal, send, reset }
}
