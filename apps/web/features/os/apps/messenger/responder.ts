export type Sender = 'viewer' | 'contact'

export interface Message {
  id: number
  from: Sender
  text: string
}

/**
 * Produces the contact's next reply to the conversation so far ('' = no reply).
 * Must not reject: a responder maps its own failures to a reply or ''.
 */
export type Responder = (history: readonly Message[]) => Promise<string>

/** The visitor's Nth message gets the Nth reply; once they run out, the last one repeats. */
export const scriptedResponder =
  (replies: readonly string[]): Responder =>
  async (history) => {
    const sent = history.filter((m) => m.from === 'viewer').length
    return replies[Math.min(sent, replies.length) - 1] ?? ''
  }

const MS_PER_CHAR = 40
const MIN_MS = 800
const MAX_MS = 2500

/** How long the contact "is typing" before a reply appears. */
export const typingDelay = (reply: string): number => Math.min(MAX_MS, Math.max(MIN_MS, reply.length * MS_PER_CHAR))
