import { parseNotice, ScheduleCallRendered, type TwinNotice } from '@repo/twin/contract'

/** One rendered item of the conversation history. */
export type Line =
  | { kind: 'text'; id: string; from: 'viewer' | 'contact'; text: string }
  | { kind: 'booking'; id: string; booking: ScheduleCallRendered }
  | { kind: 'notice'; id: string; notice: TwinNotice }

/** A line of chat text from the visitor or the twin. */
export type TextLine = Extract<Line, { kind: 'text' }>

/** Who wrote a text line. */
export type Sender = TextLine['from']

/** The parts of eve messages this window reads (a structural subset of `EveMessage`). */
export interface MessageLike {
  id: string
  role: 'user' | 'assistant'
  parts: ReadonlyArray<{ type: string; text?: string; toolName?: string; state?: string; input?: unknown; output?: unknown; toolCallId?: string }>
}

/**
 * Flattens eve messages into the window's lines: visitor text, twin text split into one line per
 * paragraph (as the owner texts in bursts), the booking dialog (the only tool with a visible
 * result), and booking notices rendered as system lines.
 */
export function toLines(messages: readonly MessageLike[]): Line[] {
  const lines: Line[] = []
  for (const m of messages) {
    m.parts.forEach((p, i) => {
      const id = `${m.id}:${i}`
      if (p.type === 'text' && p.text) {
        const notice = m.role === 'user' ? parseNotice(p.text) : null
        if (notice) lines.push({ kind: 'notice', id, notice })
        else if (m.role === 'user') lines.push({ kind: 'text', id, from: 'viewer', text: p.text })
        else
          // The twin texts in bursts: each paragraph is its own Messenger line, keyed by its index so
          // a streaming reply appends lines without re-keying the earlier ones.
          p.text
            .split(/\n\s*\n/)
            .map((t) => t.trim())
            .filter(Boolean)
            .forEach((text, n) => lines.push({ kind: 'text', id: `${id}:${n}`, from: 'contact', text }))
      }
      if (p.type === 'dynamic-tool' && p.toolName === 'schedule_call' && p.state === 'output-available') {
        // A refused or absent descriptor renders nothing, as the spec defines.
        const booking = ScheduleCallRendered.safeParse(p.output)
        if (booking.success) lines.push({ kind: 'booking', id, booking: booking.data })
      }
    })
  }
  return lines
}

/** The events that move a turn along; anything else (tasks, inputs, completions) is ignored. */
const TURN_LIFECYCLE = new Set(['turn.started', 'step.started', 'message.appended', 'turn.waiting', 'turn.completed', 'turn.cancelled', 'turn.failed'])

/**
 * Whether the open turn is parked on a `turn.waiting` (an approval task can hold it for minutes),
 * so the window should not claim the twin is typing. eve keeps `events` as the full ordered stream.
 */
export function isParked(events: ReadonlyArray<{ type: string }>): boolean {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const type = events[i]?.type
    if (type !== undefined && TURN_LIFECYCLE.has(type)) return type === 'turn.waiting'
  }
  return false
}
